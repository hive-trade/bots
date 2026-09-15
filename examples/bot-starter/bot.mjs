#!/usr/bin/env node
/**
 * HiveTrade standalone Polymarket starter.
 *
 * Canonical signing contract pinned to hive-trade/hivetrade@730bf9e80b2d760e
 * (packages/bot-kit/src/botSignal.ts). The exported helpers below deliberately
 * remain small and dependency-light so tests can prove the exact signed bytes.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createWalletClient, http } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  Chain as PolyChain,
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
} from "@polymarket/clob-client-v2";

const DEFAULT_API = "https://api.hivetrade.com";
const CLOB_HOST = "https://clob.polymarket.com";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function botSignalMessage(signal) {
  const lines = [
    "HiveTrade bot signal v1",
    `hive:${signal.hiveId}`,
    `condition:${signal.conditionId}`,
    `side:${signal.side}`,
    `signal:${signal.signalStrength}`,
    `stake:${signal.stakeUsd}`,
    `order:${signal.orderType ?? "marketable"}`,
    `nonce:${signal.nonce}`,
    `issuedAt:${signal.issuedAt}`,
  ];
  if (signal.intent) lines.push("intent:true");
  return lines.join("\n");
}

export function botFillMessage(fill) {
  const result = fill.fillResult;
  const number = (value) => typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
  return [
    "HiveTrade bot fill v1",
    `hive:${fill.hiveId}`,
    `market:${fill.marketId}`,
    `filled:${result.filled ? "true" : "false"}`,
    `order:${result.orderID ?? ""}`,
    `filledUsd:${number(result.filledUsd)}`,
    `shares:${number(result.sizeShares)}`,
    `nonce:${fill.nonce}`,
    `issuedAt:${fill.issuedAt}`,
  ].join("\n");
}

export function botWalletRegistrationMessage(registration) {
  return [
    "hivetrade:bot-register-wallet",
    registration.hiveId,
    registration.walletAddress.toLowerCase(),
    registration.issuedAt,
  ].join(":");
}

export async function signBotSignal(account, signal) {
  return account.signMessage({ message: botSignalMessage(signal) });
}

export async function signBotFill(account, fill) {
  return account.signMessage({ message: botFillMessage(fill) });
}

export async function registerWallet({ account, api, hiveId, walletAddress, fetchFn = fetch }) {
  const issuedAt = Date.now();
  const registration = { hiveId, walletAddress, issuedAt };
  const signature = await account.signMessage({
    message: botWalletRegistrationMessage(registration),
  });
  const response = await fetchFn(`${api}/api/admin/bot/register-wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...registration, signature }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`wallet registration HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

export function parseGammaArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function findMarket(slug, fetchFn = fetch) {
  if (!slug) return null;
  const response = await fetchFn(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&closed=false`);
  if (!response.ok) throw new Error(`Gamma HTTP ${response.status}`);
  const [market] = await response.json();
  if (!market?.conditionId) return null;
  const prices = parseGammaArray(market.outcomePrices);
  const tokenIds = parseGammaArray(market.clobTokenIds);
  return {
    conditionId: String(market.conditionId),
    question: String(market.question ?? market.conditionId),
    yesPrice: Number(prices[0] ?? 0.5),
    yesTokenId: tokenIds[0] == null ? null : String(tokenIds[0]),
    noTokenId: tokenIds[1] == null ? null : String(tokenIds[1]),
    negRisk: market.neg_risk === true || (typeof market.negRiskMarketID === "string" && market.negRiskMarketID.length > 0),
  };
}

export function strategy(market) {
  if (market.yesPrice < 0.45 || market.yesPrice > 0.55) return null;
  return null; // Deliberately safe: replace with a tested edge before enabling.
}

function roundPrice(price, tick) {
  const step = Number(tick);
  const decimals = String(tick).split(".")[1]?.length ?? 0;
  return Number(Math.min(1 - step, Math.max(step, Math.round(price / step) * step)).toFixed(decimals));
}

function interpretOrder(raw, { requestedUsd, makerWallet }) {
  const response = raw ?? {};
  const error = typeof response.error === "string"
    ? response.error
    : response.error == null ? response.errorMsg : JSON.stringify(response.error);
  const orderID = typeof response.orderID === "string" ? response.orderID : "";
  const status = response.status == null ? "" : String(response.status);
  if (error || response.success === false || status === "STATE_FAILED" || !orderID) {
    return {
      filled: false,
      orderID,
      status: status || "rejected",
      filledUsd: 0,
      requestedUsd,
      makerWallet,
      reason: String(error || "CLOB returned no accepted order").slice(0, 300),
    };
  }
  const making = Number(response.makingAmount);
  const taking = Number(response.takingAmount);
  const filledUsd = Number.isFinite(making) && making > 0 ? making : requestedUsd;
  const sizeShares = Number.isFinite(taking) && taking > 0 ? taking : undefined;
  return {
    filled: true,
    orderID,
    status: status || "matched",
    filledUsd,
    ...(sizeShares == null ? {} : { sizeShares, avgPrice: filledUsd / sizeShares }),
    requestedUsd,
    makerWallet,
  };
}

export async function buildClobClient({ account, depositWallet, builderCode, rpcUrl }) {
  const signer = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });
  const base = {
    host: CLOB_HOST,
    chain: PolyChain.POLYGON,
    signer,
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositWallet,
    builderConfig: { builderCode: builderCode ?? ZERO_BYTES32 },
  };
  const anonymous = new ClobClient(base);
  let creds;
  try {
    creds = await anonymous.deriveApiKey();
    if (!creds?.key || !creds?.secret || !creds?.passphrase) throw new Error("incomplete credentials");
  } catch {
    creds = await anonymous.createOrDeriveApiKey();
  }
  if (!creds?.key || !creds?.secret || !creds?.passphrase) {
    throw new Error("Polymarket returned incomplete L2 credentials");
  }
  return new ClobClient({ ...base, creds });
}

export async function placeCaptainOrder({ account, depositWallet, builderCode, rpcUrl, market, side, stakeUsd }) {
  const tokenId = side === "yes" ? market.yesTokenId : market.noTokenId;
  if (!tokenId) throw new Error(`Gamma returned no ${side.toUpperCase()} token id`);
  const decisionPrice = side === "yes" ? market.yesPrice : 1 - market.yesPrice;
  const client = await buildClobClient({ account, depositWallet, builderCode, rpcUrl });
  await client.updateBalanceAllowance({ asset_type: "COLLATERAL" }).catch(() => {});
  let tick = "0.01";
  try { tick = await client.getTickSize(tokenId); } catch { /* use conservative default */ }
  const price = roundPrice(Math.min(0.97, decisionPrice + 0.04), tick);
  try {
    const raw = await client.createAndPostMarketOrder(
      { tokenID: tokenId, amount: stakeUsd, price, side: Side.BUY, orderType: OrderType.FAK },
      { negRisk: market.negRisk, tickSize: tick },
      OrderType.FAK,
    );
    return interpretOrder(raw, { requestedUsd: stakeUsd, makerWallet: depositWallet });
  } catch (error) {
    return {
      filled: false, orderID: "", status: "threw", filledUsd: 0,
      requestedUsd: stakeUsd, makerWallet: depositWallet,
      reason: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    };
  }
}

export async function signalFirstRoundTrip({
  account,
  api,
  hiveId,
  stakeUsd,
  market,
  side,
  placeOrder,
  fetchFn = fetch,
  nonce = crypto.randomUUID(),
  now = () => Date.now(),
}) {
  const signal = {
    hiveId, conditionId: market.conditionId, side,
    signalStrength: 100, stakeUsd, orderType: "marketable",
    nonce, issuedAt: now(), intent: true,
  };
  const signature = await signBotSignal(account, signal);
  const accepted = await fetchFn(`${api}/api/bot/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal, signature }),
  });
  const acceptedBody = await accepted.json().catch(() => ({}));
  if (accepted.status !== 201 || acceptedBody.go !== true || !Number.isInteger(acceptedBody.id)) {
    return { accepted: false, status: accepted.status, body: acceptedBody };
  }

  let result;
  try {
    result = await placeOrder();
  } catch (error) {
    result = {
      filled: false, orderID: "", status: "threw", filledUsd: 0,
      requestedUsd: stakeUsd,
      reason: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    };
  }
  const fill = {
    hiveId,
    marketId: acceptedBody.id,
    fillResult: result,
    nonce: `fill-${nonce}`,
    issuedAt: now(),
  };
  const fillSignature = await signBotFill(account, fill);
  const reported = await fetchFn(`${api}/api/bot/signal/${acceptedBody.id}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fill, signature: fillSignature }),
  });
  const reportedBody = await reported.json().catch(() => ({}));
  return {
    accepted: true,
    marketId: acceptedBody.id,
    fillResult: result,
    reportStatus: reported.status,
    reportBody: reportedBody,
  };
}

export function loadConfig(env = process.env) {
  const privateKey = env.BOT_PRIVATE_KEY ?? "";
  const hiveId = Number(env.BOT_HIVE_ID);
  const depositWallet = env.BOT_DEPOSIT_WALLET ?? "";
  const stakeUsd = Number(env.STAKE_USD ?? "1");
  const pollSeconds = Number(env.POLL_SECONDS ?? "60");
  if (!PRIVATE_KEY_RE.test(privateKey)) throw new Error("BOT_PRIVATE_KEY must be a 0x-prefixed 32-byte key");
  if (!Number.isSafeInteger(hiveId) || hiveId <= 0) throw new Error("BOT_HIVE_ID must be a positive integer");
  if (!ADDRESS_RE.test(depositWallet)) throw new Error("BOT_DEPOSIT_WALLET must be a 0x address");
  if (!Number.isFinite(stakeUsd) || stakeUsd <= 0) throw new Error("STAKE_USD must be positive");
  if (!Number.isFinite(pollSeconds) || pollSeconds < 10) throw new Error("POLL_SECONDS must be at least 10");
  return {
    account: privateKeyToAccount(privateKey),
    api: env.HIVETRADE_API ?? DEFAULT_API,
    hiveId,
    depositWallet,
    stakeUsd,
    pollSeconds,
    marketSlug: env.MARKET_SLUG,
    rpcUrl: env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com",
  };
}

export async function main() {
  const config = loadConfig();
  const builderResponse = await fetch(`${config.api}/api/bot/builder-config`);
  const builder = builderResponse.ok ? await builderResponse.json() : {};
  const builderCode = /^0x[0-9a-fA-F]{64}$/.test(builder.builderCode ?? "")
    ? builder.builderCode
    : ZERO_BYTES32;
  const traded = new Set();
  console.log(`[bot] ${config.account.address} → hive ${config.hiveId} on ${config.api}`);
  for (;;) {
    try {
      const market = await findMarket(config.marketSlug);
      if (market && !traded.has(market.conditionId)) {
        const side = strategy(market);
        if (!side) {
          console.log(`[skip] ${market.question} @ ${market.yesPrice}`);
        } else {
          const outcome = await signalFirstRoundTrip({
            ...config, market, side,
            placeOrder: () => placeCaptainOrder({ ...config, builderCode, market, side }),
          });
          console.log(`[signal] ${side} ${market.conditionId.slice(0, 10)}…`, outcome);
          if (outcome.accepted) traded.add(market.conditionId);
        }
      }
    } catch (error) {
      console.error("[tick error]", error instanceof Error ? error.message : error);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, config.pollSeconds * 1000));
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) await main();
