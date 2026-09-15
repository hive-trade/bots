export function positive(value, name, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new Error(`Invalid ${name}`);
  return n;
}
export function config(env = process.env) {
  if (!['polymarket', 'kalshi'].includes(env.VENUE)) throw new Error('Set VENUE to polymarket or kalshi');
  const api = env.BOT_API_URL ?? 'https://api.hivetrade.com';
  if (!['https://api.hivetrade.com', 'https://api-dev.hivetrade.com'].includes(api)) throw new Error('Use a documented HiveTrade API origin');
  const hiveId = positive(env.BOT_HIVE_ID, 'BOT_HIVE_ID');
  if (!Number.isSafeInteger(hiveId)) throw new Error('BOT_HIVE_ID must be an integer');
  if (!['false', 'true'].includes(env.BOT_LIVE_TRADING_ENABLED ?? 'false')) throw new Error('Live flag must be true or false');
  const strength = Number(env.SIGNAL_STRENGTH ?? 25);
  if (![10, 25, 50, 100].includes(strength)) throw new Error('Invalid SIGNAL_STRENGTH');
  return { venue: env.VENUE, api, hiveId, strength,
    live: env.BOT_LIVE_TRADING_ENABLED === 'true',
    maxStake: positive(env.MAX_STAKE_USD ?? 1, 'MAX_STAKE_USD'),
    stateDir: env.STATE_DIR ?? './state',
  };
}
