// npm run dry-run: the same run as npm start, with live trading forced off and
// no signing key, whatever .env says. Works before the Hive exists.
// node --env-file never overrides a variable already set, but this script runs
// after .env is loaded, so these assignments win.
process.env.BOT_LIVE_TRADING_ENABLED = 'false';
process.env.BOT_PRIVATE_KEY = '';
await import('../bot.mjs');
