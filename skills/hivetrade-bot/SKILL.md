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
(`get_setup_status`, `get_signing_key_command`, `update_settings`,
`prepare_registration`, `check_registration`, `set_hive_id`, `get_bot_status`,
`list_strategies`, `get_deploy_guide`, `dry_run`). Otherwise use the npm scripts named in each step.

**Hard rules, every step:**
- **Never read, cat, grep, open or print `.env`**, not even one line. Change
  public settings with `update_settings` (or `npm run settings -- KEY=value`) and
  view them with `get_setup_status` (or `npm run settings`, which hides the key).
- **Never create the signing key yourself and never run `npm run setup`.** The
  user runs it in their own terminal and gives you the public address.
- Never print a private key and never ask the user for one. Show only the public
  signing address.
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
   key; only markets in the series listed at docs.hivetrade.com/run-a-bot/kalshi,
   set as `KALSHI_TICKER` or, for fast series like `KXBTC15M`, `KALSHI_SERIES`) or **Polymarket**
   (the bot signs the Call and HiveTrade places the order in the user's own
   HiveTrade account).
2. Bot name (3 to 40 characters), a one-line description, and a category.
3. The user's own rule in their words, and the exact market (a link is fine).
   For Polymarket, run `find_market` (or `npm run find-market -- <link>`): an
   event link can hold many markets; show the list and let the user pick. Tell
   them the market's end date as a fact. Never suggest, rank or choose a market.
4. Two amounts, both set on the Hive (at Create, editable in Studio), never in
   `.env`:
   - **Amount per Call**, in USD (1 to 100): what each Call stakes.
   - **Total budget**, in USD: the most the bot may have at risk across its
     Calls. Live stakes plus losses since it was set count as used; wins refill
     it up to the total.
   A Call carries no amount: the bot sends the market, the side and a price cap.
   Never describe a daily limit: there is none. State the amounts as the user's
   choice; never suggest one.
5. Where it runs: this computer, or a host (Railway helper available).
6. Environment: production (default, app.hivetrade.com) or dev
   (dev.hivetrade.com). Say plainly that dev also trades real money on Polymarket
   and Kalshi.

**Check:** you can restate venue, name, idea, market, Amount per Call, Total
budget and host in one sentence and the user agrees.

## 2. Get the kit and create the signing identity

The project folder must be a clone of `https://github.com/hive-trade/bots`
(Node 24+): `git clone https://github.com/hive-trade/bots.git my-bot && cd my-bot && npm ci`.
Then ask the user to create the signing key themselves (`get_signing_key_command`
gives the exact words; pass `environment: "dev"` when they chose dev): open a
terminal, go to the bot folder, run `npm run setup` (or `npm run setup -- --dev`
for dev), and give you the public address it prints. Do not run it for them. It writes
`.env` at mode 0600, never shows the key, and refuses to overwrite one. Tell the
user to keep a private backup of `.env`.

**Check:** `get_setup_status` shows `envFile: true`, `envFilePrivate: true`, and a
`signingAddress` equal to the address the user gave you.

## 3. Implement the strategy

Run `list_strategies` (or read `strategy-playbook.md`). Put the user's rule in
`strategy.mjs`: return `null` or `{ skip: true, reasons }` to skip, or
`{ side: "yes" | "no", maxPrice, reasons }` to trade. `maxPrice` is inclusive: for
a rule that says "below 20 cents", implement exactly what the user said and tell
them how the limit reads. `reasons` is a list of short text lines explaining the
decision in the user's terms; the dry run prints them as `TRACE` lines (this is
the "decision trace"). Keep execution code untouched. Set the market (`KALSHI_TICKER` or `MARKET_SLUG`)
with `update_settings` (or `npm run settings -- KEY=value`). There is no stake
setting: each Call stakes the Hive's Amount per Call. Put
any value the rule needs in a `STRATEGY_*` setting or in `strategy.mjs`. Never
open `.env`.

**Check:** replace `test/example-strategy.test.mjs` (the example rule's tests)
with tests for the user's rule, including stale or missing data. Leave the other
test files alone: they test the kit and never load `strategy.mjs`. `npm run check`
and `npm test` pass.

## 4. Dry run

`dry_run` (or `npm run dry-run`). Live trading is forced off and the run gets no
key; nothing is submitted. A dry run needs no Hive ID, so it works before
registration (step 5).

**Check:** the output shows `TRACE` lines (the market, its asks, then the rule's
reasons) followed by `DRY RUN` with the market, side and price cap (the amount
reads "the Amount per Call set on your Hive"), or `SKIP: your rule did not select a trade.` Explain what it means and what a dry run does not prove.

## 5. Registration link

`prepare_registration` with name, bio, category, venue, `amountPerCallUsd` and
environment. Give the user the link and its instructions: open it signed in,
check that the signing address equals the one from step 2, review the Amount
per Call, type the Total budget, allow the bot, press Create. A bot Hive has no agreement checkbox; do not tell the user to look for one. Without the MCP tool, build the same link:
`https://app.hivetrade.com/bots/new?name=…&bio=…&category=…&venue=…&signer=<address>&maxStake=<Amount per Call>&from=agent`
(dev: `https://dev.hivetrade.com`), URL-encoded.

**Check:** the user confirms they pressed Create and the address matched.

## 6. Confirm the Hive

`check_registration`. It signs a lookup with the bot's key and writes
`BOT_HIVE_ID` (and `BOT_API_URL`, `VENUE`) to `.env`.
- "Not created yet": the user has not pressed Create, used another address, or
  another environment. Do not retry in a loop; ask.
- "Lookup unavailable": ask for the Hive ID the page showed, then `set_hive_id`
  (without the MCP tool, the user runs `npm run set-hive -- <ID>`).
- HTTP 401: the computer clock is probably wrong.
- Without the MCP tool: `npm run whoami` does the same signed lookup and says
  whether `BOT_HIVE_ID` matches; `npm run set-hive -- <ID>` saves it.
- Warn the user: never paste the Hive page's `.env` snippet over `.env`; it
  would delete the signing key.

**Check:** `get_setup_status` shows the `hiveId`; `get_bot_status` returns
`found: true` with the expected name and venue. It uses the bot's signed reads,
so a Private Hive (the form's default) is found too; `publicPage: false` is
normal and is not a settings problem. Without the MCP tool, the same check is a
signed `POST /api/bot/budget` (see [protocol](../../docs/protocol.md)).

## 7. Venue setup (the user does this)

- **Kalshi:** the user connects their Kalshi API key in HiveTrade Settings and
  completes the execution consent. Nothing Kalshi-related goes in `.env` except
  the ticker (or series).
- **Polymarket:** the bot trades from the user's own HiveTrade account. The user,
  in HiveTrade, sets the Hive's Amount per Call and Total budget and allows the
  bot to trade (in Studio, or while creating the Hive). There is nothing to fund for the bot.
  Never tell the user to send money to a bot address, sign in to Polymarket as
  the bot, or import the bot's key into a wallet app. `POLYMARKET_LEGACY_SELF_MANAGED`
  and "register the wallet" (`npm run bind-wallet`) are only for older bots that
  already place their own orders from their own deposit wallet; never set them
  for a new bot.

**Check:** Kalshi - the user confirms the key and consent are done. Polymarket -
the user confirms the Amount per Call and Total budget are set and the bot is
allowed to trade.
Run `dry_run` again: it should reach `DRY RUN` or `SKIP`.

## 8. Hosting

If the bot should run while the computer is off, follow
[`skills/hivetrade-deploy/SKILL.md`](../hivetrade-deploy/SKILL.md) (or
`get_deploy_guide`). Tell the user before they pay for hosting: the hosted job
is practice only, a scheduled dry run that never places real orders. Real trading
works only on their own computer today.

**Check:** `npm run railway -- verify …` reports a verified dry run.

## 9. Live trading: only on the user's explicit decision

Summarize the exact market, side, price cap, the Hive's Amount per Call and Total
budget, the venue account and what remains unverified. Live trading starts only when the user decides and sets
`BOT_LIVE_TRADING_ENABLED=true` themselves (on a host, they also set
`BOT_PRIVATE_KEY` in its secret settings themselves). Do not do it for them, and
never as a test. After a live run, check the venue receipt and the Hive Call
together; see [recovery](../../docs/recovery.md) for anything uncertain.
