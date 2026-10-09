---
name: hivetrade-bot
description: Guided setup of the user's own HiveTrade bot Hive - signing identity, their strategy, tests and dry run, a pre-filled registration link they confirm, venue setup and hosting. Use when someone wants to build, register or run a HiveTrade bot.
---

# Set up a HiveTrade bot, step by step

Read the repository's [README](../../README.md) and [AGENTS.md](../../AGENTS.md)
(fetch them from the same repository/ref if you are reading this remotely). This
kit holds public integration code and educational examples only; the strategy is
the user's own. HiveTrade is signal-sharing software: trades execute in each
person's own Polymarket or Kalshi account.

**Tools.** When the `hivetrade-bot` MCP server is connected, use its tools
(`get_setup_status`, `create_signing_key`, `prepare_registration`,
`check_registration`, `set_hive_id`, `get_bot_status`, `list_strategies`,
`get_deploy_guide`, `dry_run`). Otherwise use the npm scripts named in each step.

**Hard rules, every step:**
- Never read `.env` into the conversation or tool output, never print a private
  key, and never ask the user for one. Show only the public signing address.
- Never submit the Hive registration, connect a venue account, fund a wallet, or
  set `BOT_LIVE_TRADING_ENABLED=true` for the user. Those are their actions.
- Tests, dry runs and "set it up" requests never authorize a real-money trade.
- Never present a copy-size or "signal strength" setting: every Member's copy is
  their own per-call budget. No promises of profit.

Work through the steps in order. After each one, run its **Check** and only move
on when it passes. If a check fails, explain what is missing in plain words.

## 1. Ask first

Ask, reusing anything already said:
1. Venue: **Kalshi** (shorter: HiveTrade executes with the user's connected Kalshi
   key; only `KXBTC15M`, `KXETH15M`, `KXSOL15M` tickers today) or **Polymarket**
   (the bot needs its own deposit wallet, deployed and funded).
2. Bot name (3 to 40 characters), a one-line description, and a category.
3. The strategy idea in plain language, and the exact market.
4. Per-call cap in USD (1 to 100) for the Hive, and `MAX_STAKE_USD` locally.
5. Where it runs: this computer, or a host (Railway helper available).
6. Environment: production (default) or dev.

**Check:** you can restate venue, name, idea, market, cap and host in one sentence
and the user agrees.

## 2. Get the kit and create the signing identity

The project folder must be a clone of `https://github.com/hive-trade/bots`
(Node 24+): `git clone https://github.com/hive-trade/bots.git my-bot && cd my-bot && npm ci`.
Then `create_signing_key` (or `npm run setup`). It writes `.env` at mode 0600 and
refuses to overwrite one. Tell the user to keep a private backup of `.env`.

**Check:** `get_setup_status` shows `envFile: true`, a `signingAddress`, and
`envFilePrivate: true`. Show the user the address only.

## 3. Implement the strategy

Run `list_strategies` (or read `strategy-playbook.md`). Put the user's rule in
`strategy.mjs`: return `null` to skip or `{ side: "yes" | "no", maxPrice }`. Keep
execution code untouched. Set the market (`KALSHI_TICKER` or `MARKET_SLUG`) and
stake settings in `.env` by editing only those lines, without printing the file.

**Check:** add tests for the rule (including stale or missing data); `npm run check`
and `npm test` pass.

## 4. Dry run

`dry_run` (or `npm start` with `BOT_LIVE_TRADING_ENABLED=false`). Live trading is
forced off; nothing is submitted. Before registration the MCP tool uses a
placeholder Hive ID for the preview; with `npm start`, register first (step 5).

**Check:** the output shows `DRY RUN` with the market, side, price cap and maximum
stake, or `SKIP`. Explain what it means and what a dry run does not prove.

## 5. Registration link

`prepare_registration` with name, bio, category, venue, `maxStakeUsd` and
environment. Give the user the link and its instructions: open it signed in,
check that the signing address equals the one from step 2, review, tick the
Captain agreement, press Create. Without the MCP tool, build the same link:
`https://app.hivetrade.com/bots/new?name=…&bio=…&category=…&venue=…&signer=<address>&maxStake=…&from=agent`
(dev: `https://dev.hivetrade.com`), URL-encoded.

**Check:** the user confirms they pressed Create and the address matched.

## 6. Confirm the Hive

`check_registration`. It signs a lookup with the bot's key and writes
`BOT_HIVE_ID` (and `BOT_API_URL`, `VENUE`) to `.env`.
- "Not created yet": the user has not pressed Create, used another address, or
  another environment. Do not retry in a loop; ask.
- "Lookup unavailable": ask for the Hive ID the page showed, then `set_hive_id`.
- HTTP 401: the computer clock is probably wrong.

**Check:** `get_setup_status` shows the `hiveId`; `get_bot_status` finds the Hive
with the expected name and venue.

## 7. Venue setup (the user does this)

- **Kalshi:** the user connects their Kalshi API key in HiveTrade Settings and
  completes the execution consent. Nothing Kalshi-related goes in `.env` except
  the ticker and contracts.
- **Polymarket:** the user deploys and funds the bot's **own** deposit wallet
  with Polymarket's supported tools, then sets `POLYMARKET_DEPOSIT_WALLET` (the
  deposit contract, not the signing address) and runs `npm run bind-wallet`.

**Check:** Kalshi - the user confirms the key and consent are done. Polymarket -
`get_setup_status` shows `polymarketDepositWallet` and `bind-wallet` succeeded.
Run `dry_run` again: it should reach `DRY RUN` or `SKIP`.

## 8. Hosting

If the bot should run while the computer is off, follow
[`skills/hivetrade-deploy/SKILL.md`](../hivetrade-deploy/SKILL.md) (or
`get_deploy_guide`). The hosted job is a scheduled preview with live trading off.

**Check:** `npm run railway -- verify …` reports a verified dry run.

## 9. Live trading: only on the user's explicit decision

Summarize the exact market, side, price cap, stake, venue account and what remains
unverified. Live trading starts only when the user decides and sets
`BOT_LIVE_TRADING_ENABLED=true` themselves (on a host, they also set
`BOT_PRIVATE_KEY` in its secret settings themselves). Do not do it for them, and
never as a test. After a live run, check the venue receipt and the Hive Call
together; see [recovery](../../docs/recovery.md) for anything uncertain.
