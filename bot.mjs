import { randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { config, positive } from './lib/config.mjs';
import { jsonRequest, kalshiStake } from './lib/protocol.mjs';
import { discoverPolymarket, preparePolymarket } from './lib/polymarket.mjs';
import { strategy } from './strategy.mjs';
import { execute } from './lib/run.mjs';
import { SafeError, stopMessage } from './lib/errors.mjs';
let stage = 'configuration';
const price = p => (Number.isFinite(p) ? `$${p.toFixed(3).replace(/0$/, '')}` : 'no ask');
// The strategy may explain itself: `reasons` is a list of short text lines,
// printed as TRACE lines so the person can see why the rule did or did not trade.
function traceLines(reasons) {
  if (reasons === undefined) return [];
  if (!Array.isArray(reasons) || reasons.some(r => typeof r !== 'string')) throw new SafeError('Your strategy returned reasons that are not a list of text lines.');
  return reasons.slice(0, 20).map(r => r.replace(/[\r\n]+/g, ' ').slice(0, 300));
}
async function main() {
  const cfg = config();
  if (cfg.hiveId === null) console.log('NOTE: BOT_HIVE_ID is not set yet. A dry run does not need it; real trading does.');
  stage = 'public market lookup';
  let market;
  if (cfg.venue === 'polymarket') market = await discoverPolymarket(process.env.MARKET_SLUG);
  else {
    const ticker = process.env.KALSHI_TICKER ?? '';
    if (!/^KX(BTC|ETH|SOL)15M-[A-Z0-9-]+$/.test(ticker)) throw new SafeError('KALSHI_TICKER must be an exact KXBTC15M, KXETH15M or KXSOL15M ticker. Set it in .env.');
    const { kalshiApiBase } = await jsonRequest(`${cfg.api}/api/bot/builder-config`);
    const base = new URL(kalshiApiBase);
    if (base.protocol !== 'https:' || !['api.elections.kalshi.com', 'external-api.kalshi.com'].includes(base.hostname) || base.username || base.password) throw new Error('Unexpected Kalshi API base');
    const { market: m } = await jsonRequest(`${base.href.replace(/\/$/, '')}/markets/${encodeURIComponent(ticker)}`);
    if (!m || m.ticker !== ticker || m.status !== 'active' || Date.parse(m.close_time) <= Date.now() || !Number.isFinite(Date.parse(m.close_time))) throw new SafeError('The market in KALSHI_TICKER is not open. Choose a currently open ticker.');
    market = { id: ticker, ticker, question: m.title,
      yesAsk: m.yes_ask_dollars != null ? Number(m.yes_ask_dollars) : Number(m.yes_ask) / 100,
      noAsk: m.no_ask_dollars != null ? Number(m.no_ask_dollars) : Number(m.no_ask) / 100 };
  }
  console.log(`TRACE market ${market.id}: ${market.question ?? 'no question text'}`);
  console.log(`TRACE asks: YES ${price(market.yesAsk)}, NO ${price(market.noAsk)}`);
  stage = 'strategy';
  const decision = strategy(market);
  stage = 'strategy configuration';
  for (const line of traceLines(decision?.reasons)) console.log(`TRACE ${line}`);
  if (!decision || decision.skip === true) { console.log('SKIP: your rule did not select a trade.'); return; }
  // A replacement strategy must keep the same bounded output contract.
  if (!['yes', 'no'].includes(decision.side)) throw new SafeError('Your strategy returned an invalid side: use "yes" or "no".');
  positive(decision.maxPrice, 'strategy maxPrice', 0.99);
  let signal = { hiveId: cfg.hiveId, venue: cfg.venue, side: decision.side,
    signalStrength: cfg.strength, intent: true, nonce: randomUUID(), issuedAt: Date.now() };
  if (cfg.venue === 'kalshi') {
    const contracts = positive(process.env.KALSHI_CONTRACTS ?? 1, 'KALSHI_CONTRACTS');
    if (!Number.isSafeInteger(contracts)) throw new SafeError('KALSHI_CONTRACTS must be a whole number.');
    const cents = Math.floor((decision.maxPrice + 1e-12) * 100);
    if (cents < 1) throw new SafeError('Your strategy\'s maxPrice is under one cent, the lowest Kalshi price.');
    signal = { ...signal, execution: 'hivetrade-v1', kalshiTicker: market.ticker,
      kalshiContracts: contracts, kalshiPriceCents: cents, stakeUsd: kalshiStake(contracts, cents) };
  } else signal = { ...signal, conditionId: market.conditionId, orderType: 'marketable', stakeUsd: positive(process.env.STAKE_USD ?? 1, 'STAKE_USD') };
  if (signal.stakeUsd > cfg.maxStake) throw new SafeError(`This trade's stake ($${signal.stakeUsd}) is above MAX_STAKE_USD ($${cfg.maxStake}). ${cfg.venue === 'kalshi' ? 'KALSHI_CONTRACTS at this price' : 'STAKE_USD'} must fit the cap you chose.`);
  console.log(JSON.stringify({ mode: cfg.live ? 'LIVE' : 'DRY RUN', market: market.id, side: decision.side, priceCap: decision.maxPrice, maximumStakeUsd: signal.stakeUsd }));
  if (!cfg.live) return; // No signer, auth, intent, order or fill submission in dry run.
  stage = 'signer and Hive preflight';
  const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY);
  const issuedAt = Date.now();
  const budget = await jsonRequest(`${cfg.api}/api/bot/budget`, { issuedAt,
    signature: await account.signMessage({ message: `hivetrade:bot-budget:${issuedAt}` }) });
  if (budget.hiveId !== cfg.hiveId || !Number.isFinite(budget.maxStakeUsd) || signal.stakeUsd > budget.maxStakeUsd) throw new SafeError('The signing key\'s Hive does not match BOT_HIVE_ID, or the stake is above the Hive\'s per-call cap.');
  stage = 'Polymarket order preparation';
  const submitOrder = cfg.venue === 'polymarket' ? await preparePolymarket(account, cfg, market, decision, signal.stakeUsd) : undefined;
  signal.issuedAt = Date.now();
  stage = 'live execution: inspect journal';
  const result = await execute({ cfg, account, signal, submitOrder, request: jsonRequest });
  console.log(JSON.stringify(result));
}
main().catch(error => {
  console.error(stopMessage(stage, error, { stateDir: process.env.STATE_DIR || './state', strategyStage: stage === 'strategy' }));
  process.exitCode = 1;
});
