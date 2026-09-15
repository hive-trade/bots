import { randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { config, positive } from './lib/config.mjs';
import { jsonRequest, kalshiStake } from './lib/protocol.mjs';
import { discoverPolymarket, preparePolymarket } from './lib/polymarket.mjs';
import { strategy } from './strategy.mjs';
import { execute } from './lib/run.mjs';
let stage = 'configuration';
async function main() {
  const cfg = config();
  stage = 'public market lookup';
  let market;
  if (cfg.venue === 'polymarket') market = await discoverPolymarket(process.env.MARKET_SLUG);
  else {
    const ticker = process.env.KALSHI_TICKER ?? '';
    if (!/^KX(BTC|ETH|SOL)15M-[A-Z0-9-]+$/.test(ticker)) throw new Error('Set a supported exact Kalshi ticker');
    const { kalshiApiBase } = await jsonRequest(`${cfg.api}/api/bot/builder-config`);
    const base = new URL(kalshiApiBase);
    if (base.protocol !== 'https:' || !['api.elections.kalshi.com', 'external-api.kalshi.com'].includes(base.hostname) || base.username || base.password) throw new Error('Unexpected Kalshi API base');
    const { market: m } = await jsonRequest(`${base.href.replace(/\/$/, '')}/markets/${encodeURIComponent(ticker)}`);
    if (!m || m.ticker !== ticker || m.status !== 'active' || Date.parse(m.close_time) <= Date.now() || !Number.isFinite(Date.parse(m.close_time))) throw new Error('Kalshi market is not open');
    market = { id: ticker, ticker, question: m.title,
      yesAsk: m.yes_ask_dollars != null ? Number(m.yes_ask_dollars) : Number(m.yes_ask) / 100,
      noAsk: m.no_ask_dollars != null ? Number(m.no_ask_dollars) : Number(m.no_ask) / 100 };
  }
  stage = 'strategy configuration';
  const decision = strategy(market);
  if (!decision) { console.log('SKIP: example rule did not select a trade.'); return; }
  // A replacement strategy must keep the same bounded output contract.
  if (!['yes', 'no'].includes(decision.side)) throw new Error('Invalid strategy side');
  positive(decision.maxPrice, 'strategy maxPrice', 0.99);
  let signal = { hiveId: cfg.hiveId, venue: cfg.venue, side: decision.side,
    signalStrength: cfg.strength, intent: true, nonce: randomUUID(), issuedAt: Date.now() };
  if (cfg.venue === 'kalshi') {
    const contracts = positive(process.env.KALSHI_CONTRACTS ?? 1, 'KALSHI_CONTRACTS');
    if (!Number.isSafeInteger(contracts)) throw new Error('Use whole contracts');
    const cents = Math.floor((decision.maxPrice + 1e-12) * 100);
    if (cents < 1) throw new Error('Kalshi price cap must be at least one cent');
    signal = { ...signal, execution: 'hivetrade-v1', kalshiTicker: market.ticker,
      kalshiContracts: contracts, kalshiPriceCents: cents, stakeUsd: kalshiStake(contracts, cents) };
  } else signal = { ...signal, conditionId: market.conditionId, orderType: 'marketable', stakeUsd: positive(process.env.STAKE_USD ?? 1, 'STAKE_USD') };
  if (signal.stakeUsd > cfg.maxStake) throw new Error('Trade exceeds local MAX_STAKE_USD');
  console.log(JSON.stringify({ mode: cfg.live ? 'LIVE' : 'DRY RUN', market: market.id, side: decision.side, priceCap: decision.maxPrice, maximumStakeUsd: signal.stakeUsd }));
  if (!cfg.live) return; // No signer, auth, intent, order or fill submission in dry run.
  stage = 'signer and Hive preflight';
  const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY);
  const issuedAt = Date.now();
  const budget = await jsonRequest(`${cfg.api}/api/bot/budget`, { issuedAt,
    signature: await account.signMessage({ message: `hivetrade:bot-budget:${issuedAt}` }) });
  if (budget.hiveId !== cfg.hiveId || !Number.isFinite(budget.maxStakeUsd) || signal.stakeUsd > budget.maxStakeUsd) throw new Error('Hive identity or platform stake cap mismatch');
  stage = 'Polymarket order preparation';
  const submitOrder = cfg.venue === 'polymarket' ? await preparePolymarket(account, cfg, market, decision, signal.stakeUsd) : undefined;
  signal.issuedAt = Date.now();
  stage = 'live execution: inspect journal';
  const result = await execute({ cfg, account, signal, submitOrder, request: jsonRequest });
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(`Stopped during ${stage}. Review configuration and state/journal.json; reconcile any submitted trade before restarting. Raw errors are suppressed to avoid exposing credentials.`); process.exitCode = 1; });
