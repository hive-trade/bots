#!/usr/bin/env node
/**
 * HiveTrade starter bot — the smallest possible bot that leads a Hive.
 *
 * OWNERSHIP: this is a template, provided as-is. Once you adapt strategy(),
 * the bot — its code, its key, its decisions, its trades — is YOURS. It runs
 * on YOUR machine; HiveTrade only verifies the signature and executes the
 * signed instruction from your own deposit wallet. Not financial advice.
 *
 * What it does, once per POLL_SECONDS:
 *   1. Finds the active market it cares about (here: by Polymarket slug).
 *   2. Runs a strategy() to decide yes / no / skip.
 *   3. Signs a HiveTrade BotSignal with ITS OWN key (EIP-191 personal_sign
 *      over a fixed canonical string — see message() below) and POSTs it.
 *      HiveTrade recovers the signer, matches it against the address you
 *      registered for your hive, places the bot's own $STAKE_USD leg, and
 *      fans the call out to every follower. Your key never leaves this file's
 *      process. No API keys, no shared secrets.
 *
 * Setup (the create-your-own guide walks through all of this):
 *   BOT_PRIVATE_KEY=0x…        # the key you generated locally
 *   BOT_HIVE_ID=123            # from registering your bot on hivetrade.co
 *   HIVETRADE_API=https://api-dev.hivetrade.co
 *   MARKET_SLUG=bitcoin-up-or-down-…   # or adapt findMarket() to your niche
 *   STAKE_USD=1                # your bot's own money per call (skin in the game)
 *
 * Run: node bot.mjs
 */
import { privateKeyToAccount } from "viem/accounts";

const API    = process.env.HIVETRADE_API ?? "https://api-dev.hivetrade.co";
const HIVE   = Number(process.env.BOT_HIVE_ID);
const STAKE  = Number(process.env.STAKE_USD ?? "1");
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? "60");
const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY);

// ── 1. Find a market ─────────────────────────────────────────────────────────
// Simplest source: Polymarket's public Gamma API. Adapt the query to your
// niche (sports, politics, crypto…). Returns { conditionId, question, yesPrice }.
async function findMarket() {
  const slug = process.env.MARKET_SLUG;
  const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}&closed=false`);
  const [m] = await r.json();
  if (!m?.conditionId) return null;
  return { conditionId: m.conditionId, question: m.question, yesPrice: Number(m.outcomePrices?.[0] ?? 0.5) };
}

// ── 2. Your strategy ─────────────────────────────────────────────────────────
// THIS is the part that's yours. Return "yes", "no", or null (skip).
// The starter rule: only bet when the market is near a coin flip and… nothing
// else. Replace with your edge — price feeds, news, models, vibes you can defend.
function strategy(market) {
  if (market.yesPrice < 0.45 || market.yesPrice > 0.55) return null; // too far gone
  return null; // ← intentionally never fires until YOU give it a reason to.
}

// ── 3. Sign + send the signal ────────────────────────────────────────────────
// The exact bytes HiveTrade verifies. Field order is FIXED (v1 scheme).
function message(s) {
  return [
    "HiveTrade bot signal v1",
    `hive:${s.hiveId}`, `condition:${s.conditionId}`, `side:${s.side}`,
    `signal:${s.signalStrength}`, `stake:${s.stakeUsd}`,
    `order:marketable`, `nonce:${s.nonce}`, `issuedAt:${s.issuedAt}`,
  ].join("\n");
}

async function fire(conditionId, side) {
  const signal = {
    hiveId: HIVE, conditionId, side,
    signalStrength: 100,          // % of each follower's per-trade budget
    stakeUsd: STAKE,
    orderType: "marketable",
    nonce: crypto.randomUUID(),   // one-time — HiveTrade rejects reuse
    issuedAt: Date.now(),         // must be fresh (2-minute window)
  };
  const signature = await account.signMessage({ message: message(signal) });
  const r = await fetch(`${API}/api/bot/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal, signature }),
  });
  const body = await r.json().catch(() => ({}));
  console.log(`[fire] ${side} on ${conditionId.slice(0, 10)}… → HTTP ${r.status}`, body.id ? `market #${body.id}` : body);
}

// ── Main loop ────────────────────────────────────────────────────────────────
const traded = new Set(); // don't re-fire the same market
console.log(`[bot] ${account.address} → hive ${HIVE} on ${API}, every ${POLL_SECONDS}s`);
for (;;) {
  try {
    const m = await findMarket();
    if (m && !traded.has(m.conditionId)) {
      const side = strategy(m);
      if (side) { await fire(m.conditionId, side); traded.add(m.conditionId); }
      else console.log(`[skip] ${m.question} @ ${m.yesPrice}`);
    }
  } catch (e) { console.error("[tick error]", e.message); }
  await new Promise((res) => setTimeout(res, POLL_SECONDS * 1000));
}
