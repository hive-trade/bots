import { SafeError } from './errors.mjs';
export function positive(value, name, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new SafeError(`${name} must be a number above 0${max === Infinity ? '' : ` and at most ${max}`}.`);
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
  if (!['polymarket', 'kalshi'].includes(env.VENUE)) throw new SafeError('VENUE must be polymarket or kalshi. Set it in .env.');
  const api = env.BOT_API_URL ?? 'https://api.hivetrade.com';
  if (!['https://api.hivetrade.com', 'https://api-dev.hivetrade.com'].includes(api)) throw new SafeError('BOT_API_URL must be https://api.hivetrade.com (production) or https://api-dev.hivetrade.com (dev).');
  if (!['false', 'true'].includes(env.BOT_LIVE_TRADING_ENABLED ?? 'false')) throw new SafeError('BOT_LIVE_TRADING_ENABLED must be true or false.');
  const live = env.BOT_LIVE_TRADING_ENABLED === 'true';
  let hiveId = null;
  if ((env.BOT_HIVE_ID ?? '') !== '' || live || requireHiveId) {
    if ((env.BOT_HIVE_ID ?? '') === '') throw new SafeError(`BOT_HIVE_ID is not set. ${live ? 'Real trading' : 'This command'} needs it: create the Hive first, then set BOT_HIVE_ID in .env (check_registration does this). A dry run (npm run dry-run) does not need it.`);
    hiveId = Number(env.BOT_HIVE_ID);
    if (!Number.isSafeInteger(hiveId) || hiveId <= 0 || String(env.BOT_HIVE_ID).trim() !== String(hiveId)) throw new SafeError('BOT_HIVE_ID must be a whole number: the ID of your Hive.');
  }
  if ((env.SIGNAL_STRENGTH ?? '') !== '' && Number(env.SIGNAL_STRENGTH) !== SIGNED_SIGNAL_STRENGTH) {
    console.warn('SIGNAL_STRENGTH is ignored: HiveTrade copies every Call at 100% of each Member\'s per-call budget. Remove it from your settings.');
  }
  const strength = SIGNED_SIGNAL_STRENGTH;
  // LEGACY flag, for Polymarket bots created before HiveTrade placed their
  // orders: the bot places its own order from its own deposit wallet. New bots
  // leave it unset. It goes away once every older bot has moved.
  if (!['false', 'true'].includes(env.POLYMARKET_LEGACY_SELF_MANAGED || 'false')) throw new SafeError('POLYMARKET_LEGACY_SELF_MANAGED must be true or false (new bots leave it empty).');
  const legacySelfManaged = env.VENUE === 'polymarket' && env.POLYMARKET_LEGACY_SELF_MANAGED === 'true';
  // A Call carries no amount: each Call stakes the Hive's Amount per Call,
  // set in HiveTrade when you create the Hive and editable in Studio. Only a
  // legacy self-managed bot, which buys from its own wallet, still needs its
  // own stake (STAKE_USD, at most MAX_STAKE_USD).
  if (!legacySelfManaged) {
    const ignored = ['STAKE_USD', 'MAX_STAKE_USD', 'KALSHI_CONTRACTS'].filter(k => (env[k] ?? '') !== '');
    if (ignored.length) console.warn(`${ignored.join(', ')} ${ignored.length === 1 ? 'is' : 'are'} ignored: each Call stakes the Amount per Call set on your Hive in HiveTrade. Remove ${ignored.length === 1 ? 'it' : 'them'} from your settings.`);
  }
  return { venue: env.VENUE, api, hiveId, strength, live, legacySelfManaged,
    ...(legacySelfManaged ? {
      stake: positive(env.STAKE_USD || 1, 'STAKE_USD'),
      maxStake: positive(env.MAX_STAKE_USD || 1, 'MAX_STAKE_USD'),
    } : {}),
    stateDir: env.STATE_DIR ?? './state',
  };
}
