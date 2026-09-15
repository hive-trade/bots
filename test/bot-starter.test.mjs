import assert from "node:assert/strict";
import test from "node:test";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  botFillMessage,
  botSignalMessage,
  botWalletRegistrationMessage,
  loadConfig,
  registerWallet,
  signalFirstRoundTrip,
} from "../examples/bot-starter/bot.mjs";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);
const market = { conditionId: `0x${"ab".repeat(32)}`, yesPrice: 0.5, yesTokenId: "1", noTokenId: "2", negRisk: false };
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("canonical signal and fill messages bind intent, nonce and actual fill geometry", () => {
  const signal = { hiveId: 7, conditionId: market.conditionId, side: "yes", signalStrength: 100, stakeUsd: 1, orderType: "marketable", nonce: "n-1", issuedAt: 123, intent: true };
  assert.equal(botSignalMessage(signal), [
    "HiveTrade bot signal v1", "hive:7", `condition:${market.conditionId}`, "side:yes",
    "signal:100", "stake:1", "order:marketable", "nonce:n-1", "issuedAt:123", "intent:true",
  ].join("\n"));
  const fill = { hiveId: 7, marketId: 9, fillResult: { filled: true, orderID: "ord-1", filledUsd: 1, sizeShares: 2 }, nonce: "fill-n-1", issuedAt: 124 };
  assert.match(botFillMessage(fill), /market:9\nfilled:true\norder:ord-1\nfilledUsd:1\nshares:2/);
});

test("valid signal-first flow signs both phases and never sends the private key", async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return calls.length === 1 ? jsonResponse(201, { go: true, id: 41 }) : jsonResponse(200, { ok: true });
  };
  const outcome = await signalFirstRoundTrip({
    account, api: "https://api.example", hiveId: 7, stakeUsd: 1, market, side: "yes",
    nonce: "valid-nonce", now: (() => { let value = 1000; return () => value++; })(), fetchFn,
    placeOrder: async () => ({ filled: true, orderID: "ord-1", status: "matched", filledUsd: 1, sizeShares: 2, avgPrice: 0.5, requestedUsd: 1, makerWallet: `0x${"cd".repeat(20)}` }),
  });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.reportStatus, 200);
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls).includes(PRIVATE_KEY.slice(2)), false);
  assert.equal(calls[0].body.signal.intent, true);
  assert.equal(calls[1].body.fill.fillResult.orderID, "ord-1");
  const recoveredSignal = await recoverMessageAddress({ message: botSignalMessage(calls[0].body.signal), signature: calls[0].body.signature });
  const recoveredFill = await recoverMessageAddress({ message: botFillMessage(calls[1].body.fill), signature: calls[1].body.signature });
  assert.equal(recoveredSignal.toLowerCase(), account.address.toLowerCase());
  assert.equal(recoveredFill.toLowerCase(), account.address.toLowerCase());
});

test("rejection or replay never places the captain order", async () => {
  let placed = 0;
  const result = await signalFirstRoundTrip({
    account, api: "https://api.example", hiveId: 7, stakeUsd: 1, market, side: "yes",
    nonce: "replay", fetchFn: async () => jsonResponse(409, { code: "REPLAY" }),
    placeOrder: async () => { placed += 1; },
  });
  assert.equal(result.accepted, false);
  assert.equal(placed, 0);
});

test("a local execution failure is truthfully reported as a non-fill", async () => {
  const calls = [];
  const result = await signalFirstRoundTrip({
    account, api: "https://api.example", hiveId: 7, stakeUsd: 1, market, side: "no",
    nonce: "failure", fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return calls.length === 1 ? jsonResponse(201, { go: true, id: 42 }) : jsonResponse(200, { ok: true });
    },
    placeOrder: async () => { throw new Error("provider unavailable"); },
  });
  assert.equal(result.fillResult.filled, false);
  assert.equal(calls[1].fill.fillResult.reason, "provider unavailable");
});

test("wallet registration uses the canonical signer and omits secret material", async () => {
  let sent;
  const walletAddress = `0x${"cd".repeat(20)}`;
  await registerWallet({
    account, api: "https://api.example", hiveId: 7, walletAddress,
    fetchFn: async (_url, init) => { sent = JSON.parse(init.body); return jsonResponse(200, { ok: true }); },
  });
  const recovered = await recoverMessageAddress({
    message: botWalletRegistrationMessage(sent), signature: sent.signature,
  });
  assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  assert.equal(JSON.stringify(sent).includes(PRIVATE_KEY.slice(2)), false);
});

test("configuration fails closed without well-formed local secrets and addresses", () => {
  assert.throws(() => loadConfig({ BOT_PRIVATE_KEY: "secret", BOT_HIVE_ID: "7", BOT_DEPOSIT_WALLET: `0x${"cd".repeat(20)}` }), /BOT_PRIVATE_KEY/);
  assert.throws(() => loadConfig({ BOT_PRIVATE_KEY: PRIVATE_KEY, BOT_HIVE_ID: "7", BOT_DEPOSIT_WALLET: "not-a-wallet" }), /deposit_wallet/i);
  const config = loadConfig({ BOT_PRIVATE_KEY: PRIVATE_KEY, BOT_HIVE_ID: "7", BOT_DEPOSIT_WALLET: `0x${"cd".repeat(20)}`, STAKE_USD: "1", POLL_SECONDS: "60" });
  assert.equal(config.account.address, account.address);
});
