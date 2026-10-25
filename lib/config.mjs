export function positive(value, name, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new Error(`Invalid ${name}`);
  return n;
}
// HiveTrade copies every Call at 100% of each Member's per-call budget (since
// 2026-09-30). The signed message keeps its `signal:N` field for compatibility:
// the API verifies the signature over it, then ignores the level for sizing.
export const SIGNED_SIGNAL_STRENGTH = 100;
// A dry run needs no Hive: it only reads public market data, so the rule can be
// previewed before the person creates the Hive. Real trading and wallet
// registration sign for one Hive, so they require BOT_HIVE_ID
// (requireHiveId, or live trading on).
export function config(env = process.env, { requireHiveId = false } = {}) {
  if (!['polymarket', 'kalshi'].includes(env.VENUE)) throw new Error('Set VENUE to polymarket or kalshi');
  const api = env.BOT_API_URL ?? 'https://api.hivetrade.com';
  if (!['https://api.hivetrade.com', 'https://api-dev.hivetrade.com'].includes(api)) throw new Error('Use a documented HiveTrade API origin');
  if (!['false', 'true'].includes(env.BOT_LIVE_TRADING_ENABLED ?? 'false')) throw new Error('Live flag must be true or false');
  const live = env.BOT_LIVE_TRADING_ENABLED === 'true';
  let hiveId = null;
  if ((env.BOT_HIVE_ID ?? '') !== '' || live || requireHiveId) {
    hiveId = positive(env.BOT_HIVE_ID, 'BOT_HIVE_ID');
    if (!Number.isSafeInteger(hiveId)) throw new Error('BOT_HIVE_ID must be an integer');
  }
  if ((env.SIGNAL_STRENGTH ?? '') !== '' && Number(env.SIGNAL_STRENGTH) !== SIGNED_SIGNAL_STRENGTH) {
    console.warn('SIGNAL_STRENGTH is ignored: HiveTrade copies every Call at 100% of each Member\'s per-call budget. Remove it from your settings.');
  }
  const strength = SIGNED_SIGNAL_STRENGTH;
  return { venue: env.VENUE, api, hiveId, strength, live,
    maxStake: positive(env.MAX_STAKE_USD ?? 1, 'MAX_STAKE_USD'),
    stateDir: env.STATE_DIR ?? './state',
  };
}
