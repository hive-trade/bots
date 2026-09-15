// Run from the repository root with:
// node --env-file=.env examples/kalshi-bot-starter/bot.mjs
process.env.VENUE = 'kalshi';
await import('../../bot.mjs');
