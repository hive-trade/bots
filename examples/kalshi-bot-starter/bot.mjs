#!/usr/bin/env node
/**
 * HiveTrade Kalshi starter bot.
 *
 * Safe default: discovers the exact current 15-minute directional market but
 * never trades until strategy() returns a side AND BOT_LIVE_TRADING_ENABLED is
 * exactly "true". One whole contract is a code constant, not an env knob.
 */
import { createHash, createPrivateKey, createSign } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const API = (process.env.HIVETRADE_API ?? "https://api-dev.hivetrade.com").replace(/\/$/, "");
const KALSHI_API = (process.env.KALSHI_API_BASE ?? "https://demo-api.kalshi.co/trade-api/v2").replace(/\/$/, "");
const HIVE = Number(process.env.BOT_HIVE_ID);
const COIN = (process.env.KALSHI_COIN ?? "BTC").toUpperCase();
const SIGNAL_STRENGTH = Number(process.env.SIGNAL_STRENGTH ?? "25");
const MIN_PRICE = Number(process.env.MIN_ENTRY_PRICE_CENTS ?? "1");
const MAX_PRICE = Number(process.env.MAX_ENTRY_PRICE_CENTS ?? "99");
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? "30");
const ENABLED = process.env.BOT_LIVE_TRADING_ENABLED === "true";
const CONTRACTS = 1;
const WINDOW_MS = 15 * 60_000;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (!Number.isSafeInteger(HIVE) || HIVE < 1) throw new Error("BOT_HIVE_ID must be a positive integer");
if (!["BTC", "ETH", "SOL"].includes(COIN)) throw new Error("KALSHI_COIN must be BTC, ETH, or SOL");
if (![10, 25, 50, 100].includes(SIGNAL_STRENGTH)) throw new Error("SIGNAL_STRENGTH must be 10, 25, 50, or 100");
if (!Number.isSafeInteger(MIN_PRICE) || !Number.isSafeInteger(MAX_PRICE) || MIN_PRICE < 1 || MAX_PRICE > 99 || MIN_PRICE > MAX_PRICE) {
  throw new Error("entry price bounds must be integers from 1 to 99");
}
if (!Number.isFinite(POLL_SECONDS) || POLL_SECONDS < 5) throw new Error("POLL_SECONDS must be at least 5");

const account = privateKeyToAccount(required("BOT_PRIVATE_KEY"));
const kalshiKeyId = required("KALSHI_API_KEY_ID");
const kalshiPrivateKey = required("KALSHI_PRIVATE_KEY").replace(/\\n/g, "\n");
createPrivateKey(kalshiPrivateKey); // validate before the loop starts

function botSignalMessage(s) {
  return [
    "HiveTrade bot signal kalshi-v1",
    `hive:${s.hiveId}`,
    "venue:kalshi",
    `ticker:${s.kalshiTicker}`,
    `side:${s.side}`,
    `signal:${s.signalStrength}`,
    `stake:${s.stakeUsd}`,
    `contracts:${s.kalshiContracts}`,
    `priceCents:${s.kalshiPriceCents}`,
    `nonce:${s.nonce}`,
    `issuedAt:${s.issuedAt}`,
    "intent:true",
  ].join("\n");
}

function botFillMessage(f) {
  const r = f.fillResult;
  const num = (n) => typeof n === "number" && Number.isFinite(n) ? String(n) : "";
  return [
    "HiveTrade bot fill kalshi-v1",
    `hive:${f.hiveId}`,
    `market:${f.marketId}`,
    "venue:kalshi",
    `ticker:${f.kalshiTicker}`,
    `filled:${r.filled ? "true" : "false"}`,
    `order:${r.orderID ?? ""}`,
    `filledUsd:${num(r.filledUsd)}`,
    `contracts:${num(r.sizeShares)}`,
    `avgPrice:${num(r.avgPrice)}`,
    `feeUsd:${num(r.feeUsd)}`,
    `nonce:${f.nonce}`,
    `issuedAt:${f.issuedAt}`,
  ].join("\n");
}

function kalshiSignature(timestamp, method, path) {
  const signer = createSign("SHA256");
  signer.update(timestamp + method.toUpperCase() + path);
  return signer.sign({ key: kalshiPrivateKey, padding: 6, saltLength: 32 }, "base64");
}

function clientOrderId(nonce, ticker) {
  const digest = createHash("sha256")
    .update(`hivetrade:bot-open:${HIVE}:${ticker}:${nonce}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function takerFeeUsd(contracts, priceCents) {
  const p = priceCents / 100;
  return Math.ceil(0.07 * contracts * p * (1 - p) * 100) / 100;
}

function finiteNumber(value) {
  if ((typeof value === "string" && value.trim() !== "") || typeof value === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function jsonFetch(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function discover(windowStartMs) {
  const url = new URL(`${API}/api/bot/kalshi-market`);
  url.searchParams.set("coin", COIN);
  url.searchParams.set("timeframeMinutes", "15");
  url.searchParams.set("windowStartMs", String(windowStartMs));
  const { response, body } = await jsonFetch(url);
  if (!response.ok || body.ok !== true || !body.market?.ticker) return null;
  return body.market;
}

/** Replace with a real, resolution-matched edge. Return "yes", "no", or null. */
function strategy(_market) {
  return null;
}

async function placeOrder({ ticker, side, priceCents, nonce }) {
  const path = "/portfolio/events/orders";
  const signedPath = new URL(KALSHI_API).pathname + path;
  const timestamp = String(Date.now());
  const yesPriceCents = side === "yes" ? priceCents : 100 - priceCents;
  const { response, body } = await jsonFetch(`${KALSHI_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "KALSHI-ACCESS-KEY": kalshiKeyId,
      "KALSHI-ACCESS-TIMESTAMP": timestamp,
      "KALSHI-ACCESS-SIGNATURE": kalshiSignature(timestamp, "POST", signedPath),
    },
    body: JSON.stringify({
      ticker,
      client_order_id: clientOrderId(nonce, ticker),
      side: side === "yes" ? "bid" : "ask",
      count: String(CONTRACTS),
      price: (yesPriceCents / 100).toFixed(4),
      time_in_force: "immediate_or_cancel",
      self_trade_prevention_type: "taker_at_cross",
    }),
  });
  if (!response.ok) return { filled: false, status: String(response.status), reason: `Kalshi rejected the order (${response.status})` };
  const order = body.order ?? body;
  const orderID = String(order.order_id ?? "");
  const count = finiteNumber(order.fill_count ?? order.taker_fill_count);
  if (!orderID || !Number.isSafeInteger(count) || count < 0) throw new Error("Kalshi accepted the order without a usable fill count; stop and reconcile manually");
  if (count === 0) return { filled: false, orderID, status: String(order.status ?? "unfilled"), reason: "Kalshi IOC filled zero contracts" };
  const averageFee = finiteNumber(order.average_fee_paid);
  const feeUsd = averageFee == null
    ? takerFeeUsd(count, priceCents)
    : Number((averageFee * count).toFixed(6));
  const notional = count * priceCents / 100;
  return {
    filled: true,
    orderID,
    status: String(order.status ?? "filled"),
    filledUsd: Number((notional + feeUsd).toFixed(6)),
    sizeShares: count,
    avgPrice: priceCents / 100,
    feeUsd,
    requestedUsd: notional,
  };
}

async function reportFill(marketId, ticker, fillResult, nonce) {
  const fill = {
    hiveId: HIVE,
    marketId,
    venue: "kalshi",
    kalshiTicker: ticker,
    fillResult,
    nonce: `fill-${nonce}`,
    issuedAt: Date.now(),
  };
  const signature = await account.signMessage({ message: botFillMessage(fill) });
  const deadline = Date.now() + 90_000;
  for (;;) {
    const { response, body } = await jsonFetch(`${API}/api/bot/signal/${marketId}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fill, signature }),
    });
    if (response.ok) return body;
    if (response.status !== 503 || body.retryable !== true || Date.now() >= deadline) {
      throw new Error(`fill verification failed (${response.status} ${body.code ?? "unknown"})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function fire(market, side) {
  const priceCents = side === "yes" ? Number(market.yes_ask) : Number(market.no_ask);
  if (!Number.isSafeInteger(priceCents) || priceCents < MIN_PRICE || priceCents > MAX_PRICE) {
    console.log(`[skip] ${market.ticker}: ${side.toUpperCase()} ask ${priceCents}c outside ${MIN_PRICE}-${MAX_PRICE}c`);
    return;
  }
  const nonce = `kalshi-${HIVE}-${market.ticker}-${crypto.randomUUID()}`;
  const signal = {
    venue: "kalshi",
    hiveId: HIVE,
    kalshiTicker: market.ticker,
    kalshiContracts: CONTRACTS,
    kalshiPriceCents: priceCents,
    side,
    signalStrength: SIGNAL_STRENGTH,
    stakeUsd: Number((priceCents / 100 + takerFeeUsd(CONTRACTS, priceCents)).toFixed(6)),
    intent: true,
    nonce,
    issuedAt: Date.now(),
  };
  const signature = await account.signMessage({ message: botSignalMessage(signal) });
  const { response, body } = await jsonFetch(`${API}/api/bot/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal, signature }),
  });
  const marketId = body.id ?? body.marketId;
  if (response.status !== 201 || body.go !== true || !Number.isSafeInteger(marketId)) {
    throw new Error(`intent rejected (${response.status} ${body.error ?? "unknown"})`);
  }
  const fillResult = await placeOrder({ ticker: market.ticker, side, priceCents, nonce });
  await reportFill(marketId, market.ticker, fillResult, nonce);
  console.log(`[fill] ${side.toUpperCase()} ${market.ticker}: ${fillResult.filled ? `${fillResult.sizeShares} contract` : "no fill"}`);
}

const evaluated = new Set();
console.log(`[bot] ${account.address} → Kalshi ${COIN} hive ${HIVE}; trading ${ENABLED ? "ENABLED" : "DISABLED"}`);
for (;;) {
  try {
    const windowStartMs = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
    const market = await discover(windowStartMs);
    if (!market) console.log(`[skip] no exact ${COIN} 15-minute market for this window`);
    else if (!evaluated.has(market.ticker)) {
      const side = strategy(market);
      console.log(`[market] ${market.ticker} YES ${market.yes_ask}c / NO ${market.no_ask}c → ${side ?? "skip"}`);
      if (side && ENABLED) await fire(market, side);
      else if (side && !ENABLED) console.log("[dry run] strategy fired, but BOT_LIVE_TRADING_ENABLED is false");
      evaluated.add(market.ticker);
    }
  } catch (error) {
    console.error("[tick error]", error instanceof Error ? error.message : String(error));
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1_000));
}
