import { randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { config, positive } from './lib/config.mjs';
import { jsonRequest, readBotConfig, PM_OP_EXECUTION } from './lib/protocol.mjs';
import { discoverPolymarket, operatorLimitPrice, preparePolymarket } from './lib/polymarket.mjs';
import { strategy } from './strategy.mjs';
import { execute } from './lib/run.mjs';
import { SafeError, stopMessage } from './lib/errors.mjs';
import { isSupportedKalshiTicker, isSupportedKalshiSeries, kalshiSeriesOf, pickOpenMarket } from './lib/kalshi-markets.mjs';
let stage = 'configuration';
const OPERATOR_NOT_READY = 'This Hive does not trade from your HiveTrade account yet. In HiveTrade, open the bot in Studio, set its Amount per Call and Total budget and allow the bot to trade (the same step is part of creating the Hive), then run again. A bot created before this change: see "Older Polymarket bots" in the README.';
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
    const series = process.env.KALSHI_SERIES ?? '';
    let ticker = process.env.KALSHI_TICKER ?? '';
    const docs = 'See the list at https://docs.hivetrade.com/run-a-bot/kalshi.';
    if (series && ticker) throw new SafeError('Set KALSHI_TICKER (one fixed market) or KALSHI_SERIES (the market of that series open right now), not both.');
    if (series && !isSupportedKalshiSeries(series)) throw new SafeError(`KALSHI_SERIES is not a series HiveTrade's bot API accepts. ${docs}`);
    if (!series && !isSupportedKalshiTicker(ticker)) throw new SafeError(`KALSHI_TICKER must be an exact ticker in a series HiveTrade's bot API accepts (or set KALSHI_SERIES instead). ${docs}`);
    const { kalshiApiBase } = await jsonRequest(`${cfg.api}/api/bot/builder-config`);
    const base = new URL(kalshiApiBase);
    if (base.protocol !== 'https:' || !['api.elections.kalshi.com', 'external-api.kalshi.com'].includes(base.hostname) || base.username || base.password) throw new Error('Unexpected Kalshi API base');
    const kalshi = base.href.replace(/\/$/, '');
    if (series) {
      const { markets } = await jsonRequest(`${kalshi}/markets?series_ticker=${encodeURIComponent(series)}&status=open&limit=200`);
      const picked = pickOpenMarket(markets, series);
      if (!picked.ticker && picked.open.length === 0) throw new SafeError(`No ${series} market is open right now. Try again when the next one opens.`);
      if (!picked.ticker) throw new SafeError(`${picked.open.length} ${series} markets are open at once, so the bot cannot pick one for you. Set KALSHI_TICKER to the one your rule trades (and empty KALSHI_SERIES). Open now: ${picked.open.slice(0, 10).join(', ')}${picked.open.length > 10 ? ', ...' : ''}`);
      ticker = picked.ticker;
      console.log(`TRACE KALSHI_SERIES ${series}: the market open right now is ${ticker}`);
    }
    let m;
    try { ({ market: m } = await jsonRequest(`${kalshi}/markets/${encodeURIComponent(ticker)}`)); }
    catch (error) { if (/HTTP 404/.test(String(error?.message))) throw new SafeError('Kalshi has no market with the ticker in KALSHI_TICKER. Check it for typos.'); throw error; }
    const closes = Date.parse(m?.close_time);
    if (m?.ticker === ticker && (m.status !== 'active' || !(closes > Date.now()))) {
      throw new SafeError(`The market in KALSHI_TICKER has closed${Number.isFinite(closes) ? ` (it closed at ${new Date(closes).toISOString()})` : ''}. A fixed ticker trades one market only; 15-minute markets close every 15 minutes. Set a new open ticker, or set KALSHI_SERIES=${kalshiSeriesOf(ticker)} (and empty KALSHI_TICKER) to use that series' market open right now.`);
    }
    if (!m || m.ticker !== ticker || !Number.isFinite(closes)) throw new SafeError('Kalshi returned an unexpected answer for this ticker.');
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
  // A Call carries no amount: the bot sends the market, the side and a price
  // cap. Each Call stakes the Amount per Call set on your Hive in HiveTrade
  // (when you create it, editable in Studio), within the Hive's Total budget.
  if (cfg.venue === 'kalshi') {
    const cents = Math.floor((decision.maxPrice + 1e-12) * 100);
    if (cents < 1) throw new SafeError('Your strategy\'s maxPrice is under one cent, the lowest Kalshi price.');
    signal = { ...signal, execution: 'hivetrade-v1', kalshiTicker: market.ticker, kalshiPriceCents: cents };
  } else if (cfg.legacySelfManaged) {
    // LEGACY: an older bot buys from its own wallet, so it still signs a stake.
    signal = { ...signal, conditionId: market.conditionId, stakeUsd: cfg.stake, orderType: 'marketable' };
    if (signal.stakeUsd > cfg.maxStake) throw new SafeError(`This trade's stake ($${signal.stakeUsd}) is above MAX_STAKE_USD ($${cfg.maxStake}). STAKE_USD must fit the cap you chose.`);
  } else {
    // New Polymarket bots sign a pm-op-v1 Call: HiveTrade places the order in
    // your own HiveTrade account (limitPrice is added at live time).
    signal = { ...signal, conditionId: market.conditionId, execution: PM_OP_EXECUTION };
  }
  console.log(JSON.stringify({ mode: cfg.live ? 'LIVE' : 'DRY RUN', market: market.id, side: decision.side, priceCap: decision.maxPrice,
    ...(cfg.legacySelfManaged ? { stakeUsd: signal.stakeUsd } : { amount: 'the Amount per Call set on your Hive' }) }));
  if (!cfg.live) return; // No signer, auth, intent, order or fill submission in dry run.
  stage = 'signer and Hive preflight';
  const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY);
  const issuedAt = Date.now();
  const budget = await jsonRequest(`${cfg.api}/api/bot/budget`, { issuedAt,
    signature: await account.signMessage({ message: `hivetrade:bot-budget:${issuedAt}` }) });
  if (budget.hiveId !== cfg.hiveId || !Number.isFinite(budget.maxStakeUsd)) throw new SafeError('The signing key\'s Hive does not match BOT_HIVE_ID.');
  if (cfg.legacySelfManaged && signal.stakeUsd > budget.maxStakeUsd) throw new SafeError('The stake is above the Amount per Call set on your Hive.');
  if (!cfg.legacySelfManaged) console.log(`TRACE each Call stakes your Hive's Amount per Call: $${budget.maxStakeUsd}`);
  let submitOrder;
  if (cfg.venue === 'polymarket' && !cfg.legacySelfManaged) {
    stage = 'Hive mode check';
    const mode = await readBotConfig({ account, api: cfg.api });
    if (mode.hiveId !== cfg.hiveId) throw new SafeError('The signing key\'s Hive does not match BOT_HIVE_ID.');
    if (mode.pmCaptainExecution !== 'operator') throw new SafeError(OPERATOR_NOT_READY);
    stage = 'Polymarket price step lookup';
    signal.limitPrice = await operatorLimitPrice(market, decision);
  } else if (cfg.venue === 'polymarket') {
    // Legacy: the bot places its own order ONLY while HiveTrade says this Hive
    // is still self-managed. Any other answer (operator, hivetrade, a mode this
    // kit does not know) means never place an order yourself.
    stage = 'Hive mode check';
    const mode = await readBotConfig({ account, api: cfg.api });
    if (mode.hiveId !== cfg.hiveId) throw new SafeError('The signing key\'s Hive does not match BOT_HIVE_ID.');
    if (mode.pmCaptainExecution !== 'self') throw new SafeError(mode.pmCaptainExecution === 'operator'
      ? 'This Hive now trades from your own HiveTrade account. Remove POLYMARKET_LEGACY_SELF_MANAGED and POLYMARKET_DEPOSIT_WALLET from .env, then run again.'
      : 'HiveTrade does not run this Hive as a self-managed bot, so this bot must not place its own order. Nothing was sent.');
    stage = 'Polymarket order preparation (legacy self-managed bot)';
    submitOrder = await preparePolymarket(account, cfg, market, decision, signal.stakeUsd);
  }
  signal.issuedAt = Date.now();
  stage = 'live execution: inspect journal';
  const result = await execute({ cfg, account, signal, submitOrder, request: jsonRequest });
  console.log(JSON.stringify(result));
}
main().catch(error => {
  console.error(stopMessage(stage, error, { stateDir: process.env.STATE_DIR || './state', strategyStage: stage === 'strategy' }));
  process.exitCode = 1;
});
