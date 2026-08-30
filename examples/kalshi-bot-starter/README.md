# Kalshi bot starter

This is a standalone, deliberately fail-closed example for a self-hosted
HiveTrade bot on Kalshi. It discovers only the verified BTC/ETH/SOL 15-minute
directional series and always requests one whole contract.

## Two separate credentials

1. `BOT_PRIVATE_KEY` is a local EIP-191 key. Its public address is registered
   to the Bot Hive; it signs HiveTrade intents and fill reports.
2. `KALSHI_API_KEY_ID` + `KALSHI_PRIVATE_KEY` are the bot's local trade-only RSA
   credential. They place the bot's own IOC and never go to HiveTrade.
3. Create a second Kalshi key in the same account with exactly `read` scope and
   connect it in HiveTrade Settings. HiveTrade uses it to verify the venue fill
   before any member order starts. A key with any write scope is rejected.

## Run safely

```bash
npm install viem
cp examples/kalshi-bot-starter/.env.example .env
node --env-file=.env examples/kalshi-bot-starter/bot.mjs
```

The default is Kalshi demo plus `BOT_LIVE_TRADING_ENABLED=false`: discovery
logs run, but the process does not sign or place an order. Implement `strategy()`
and prove positive/no-fill/mismatch behavior on demo before changing the flag.

There are intentionally no wallet, relayer, gas, Polygon RPC, token-id, or
builder-code settings on this venue path.
