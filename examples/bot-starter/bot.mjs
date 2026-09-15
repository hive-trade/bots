// Compatibility entry point: clone the complete repository and run npm install.
// Run from its root with: node --env-file=.env examples/bot-starter/bot.mjs
process.env.VENUE = 'polymarket';
await import('../../bot.mjs');
