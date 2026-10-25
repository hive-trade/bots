# Build your own HiveTrade bot

Give this repository to your AI coding agent. It contains an educational example,
setup tools, and the public integration code needed to publish Calls from **your
own strategy**. HiveTrade's production strategies and their tuning are not included.

HiveTrade is signal-sharing software for Polymarket and Kalshi. Trades execute in
participants' own venue accounts. Trading fees apply.

## Paste this into your agent

New to this? Use an AI agent that can run commands on your computer (Claude Code,
Codex, Cursor). Step-by-step for beginners: https://docs.hivetrade.com/run-a-bot/one-prompt

```text
Set up my own HiveTrade bot using https://github.com/hive-trade/bots.
I'm new to this, so explain each step in plain words.
1. Clone the repository into a new folder, then read README.md and AGENTS.md.
2. Ask me a few questions: Polymarket or Kalshi, my bot's name, my own trading
   rule in my own words, the exact market it trades (a link is fine), the most
   it may spend per Call, and whether it should run on this computer or on a
   server.
3. Tell me the command that creates the bot's signing key. I will run it myself
   and give you only the public address it prints. Never run it yourself, never
   open .env, and never ask me for the private key.
4. Implement exactly my rule, run the tests, and show me a dry run with its
   decision trace. Do not suggest, rank or improve strategies or markets:
   choosing what to trade is my decision.
5. Give me a pre-filled "Create a bot Hive" link. I will check the signing
   address and press Create myself.
6. Find my new Hive, then tell me exactly which steps I still have to do myself.
Never turn on real trading unless I clearly ask you to.
```

Using Claude Code? Install the plugin below and ask it to "set up my HiveTrade bot".

## Install as a Claude Code plugin

```text
/plugin marketplace add hive-trade/bots
/plugin install hivetrade-bot@hivetrade
```

The plugin adds the guided setup skill and a local MCP server (`hivetrade-bot`)
that works on the bot in your current project folder. Clone this repository there
first (step 1). On the first session the plugin installs its dependencies, which
can take about a minute; if the server shows as failed in `/mcp`, reconnect it.
The server never returns your private key, never posts a Call, and has no way to
enable live trading, move funds or read an account credential.

**Other MCP clients:** run `node mcp/server.mjs` from your clone (after `npm ci`)
as a stdio server. It uses the current directory, or `HIVETRADE_BOT_DIR` if set.
In Claude Code without the plugin: `claude mcp add hivetrade-bot -- node mcp/server.mjs`.

## How setup works

1. **You:** run `npm run setup` in your own terminal, in the bot folder. It saves
   the bot's signing key in `.env` and prints only its public address. Give that
   address to your agent. Your agent never runs this command and never opens `.env`.
2. **Agent:** writes your strategy, runs the tests and a dry run.
3. **Agent:** prepares a pre-filled "Create a bot Hive" link.
4. **You:** open it, check the signing address, and press **Create bot Hive**.
5. **Agent:** reads the new Hive ID back with a request signed by the bot's key.
6. **You:** Kalshi: connect your Kalshi API key and consent. Polymarket: live
   trading for new bots is not self-serve yet; they will trade from your own
   HiveTrade account once HiveTrade finishes that part.
7. **You:** turn on live trading, only when you decide to.

Details, the tool reference and troubleshooting: [Set up with an AI agent](docs/agent-setup.md).

## What you get

- A small **user-selected side + maximum price** example, disabled until configured.
  It is a programming example, not a forecast or a promise of profit.
- Polymarket: dry runs and Hive creation today. Live trading for new bots is not
  self-serve yet (they will trade from your own HiveTrade account). Older bots
  keep their own deposit wallet, local order and fill report.
- Kalshi: signed v2 intent; HiveTrade executes using the operator's connected account.
  No Kalshi private key belongs in this runner.
- Local key creation, spending checks, persistent duplicate prevention,
  and tests that do not place real trades.

The runner checks **one exact market once, then exits**. Start here before adding
market discovery or a timed loop. It does not manage exits, wrapping, redemption,
or a portfolio. Polymarket wallet operations remain your responsibility through
the venue's supported tools. Kalshi handles settlement in your Kalshi account.

## 1. Install and create an identity

Requires Node.js 24+ and npm. Clone the **whole repository**, not a single script:

Your agent can do the first part:

```bash
git clone https://github.com/hive-trade/bots.git my-bot
cd my-bot
npm ci
npm run check
npm test
```

`npm ci` may report a few **low** severity advisories. They come from the
Polymarket SDK's older cryptography library and have no fix yet; you do not need
to run `npm audit fix --force`, which can break the SDK.

**You** create the signing key, in your own terminal, in that folder:

```bash
npm run setup
```

It prints two lines:

```text
Your bot's public address: 0x...
Give this address to your agent. Your private key was saved in .env; never share it.
```

`setup` creates `.env` with permissions `0600`, never shows the key and refuses to
overwrite an existing `.env`. Your agent never runs `setup` and never reads, prints
or opens `.env`. It changes public settings with `npm run settings -- KEY=value`
(or the MCP tool `update_settings`) and views them with `npm run settings`, which
hides the key. Keep a private backup of the identity;
losing it may lose access to the associated wallet. Never commit `.env`, journal
files, or credentials. The example needs no access to HiveTrade's private repository.

## 2. Register the Hive

Only you can create the Hive, in your own signed-in browser. Your agent builds a
pre-filled link (MCP tool `prepare_registration`) and never submits it. Open it,
check that the **signing address** is exactly the one your agent showed you, and
press **Create bot Hive**. The agent then reads the Hive
ID back (`check_registration`) or, if that lookup is not available yet, asks you
for the ID the page showed (`set_hive_id`). See [agent setup](docs/agent-setup.md).

Manual fallback: sign in at Create a bot Hive
([production](https://app.hivetrade.com/bots/new) or [dev](https://dev.hivetrade.com/bots/new)),
choose the venue, name the Hive, enter the **public signing address**, and give
your agent the Hive ID the page shows (it saves it with `set_hive_id`).

**Spending limits.** The most your bot may spend per Call is set in two places,
and both apply: the Hive's per-call cap (the `maxStake` on the Create form) and
`MAX_STAKE_USD` in `.env`. Set both to the number you chose. The stake of each
order is `STAKE_USD` (Polymarket) or `KALSHI_CONTRACTS` at the price cap
(Kalshi), and it must fit both caps. There is no daily limit: a run places at
most one order on its market, and the kit never trades the same market twice.

**How Members' copies are sized.** Each Member's copy of your Call is their own
per-call budget, in full, reduced only by their tier cap, what is left in their
Hive budget, and what the market can fill inside the Call's price limit. Your
bot's stake does not set it.

### Environments

| | Web (where you create the Hive) | API (`BOT_API_URL`) |
|---|---|---|
| Production (default) | `https://app.hivetrade.com` | `https://api.hivetrade.com` |
| Dev | `https://dev.hivetrade.com` | `https://api-dev.hivetrade.com` |

**Dev is not play money.** The dev site places real orders with real funds on
Polymarket and Kalshi, exactly like production. Use small amounts on both.

A Hive exists on one environment only. Never mix them: the web site where you
press Create and the bot's `BOT_API_URL` must be on the same row. An API rejection is a
failed preflight, not permission to bypass a restriction.

## 3. Complete venue setup

### Kalshi

1. Set `VENUE=kalshi`.
2. Have an eligible, funded Kalshi account. Connect your Kalshi API key in
   HiveTrade Settings and complete the required execution consent.
3. Choose an exact currently open `KXBTC15M`, `KXETH15M`, or `KXSOL15M` ticker.
   These are the series currently accepted by HiveTrade's bot API; arbitrary
   sports, politics, and other Kalshi tickers are not supported by this integration.
4. Set `KALSHI_TICKER` and `KALSHI_CONTRACTS` (one whole contract initially).
   Maximum stake includes the API's fee allowance and must fit both spending caps.

Only the platform signing key goes in `.env`. HiveTrade submits the Captain order;
do not add a second local Kalshi order or a Polymarket-style fill report.

### Polymarket

**Event link or market slug?** A Polymarket *event* page
(`polymarket.com/event/<event>`) can hold many Yes/No *markets*, and each market
has its own slug. The bot trades exactly one market, so `MARKET_SLUG` must be a
market slug. Paste the link into `npm run find-market -- <link>` (MCP tool
`find_market`): if the link points at one market it prints `MARKET_SLUG=...`, its
status and Polymarket's end date; if it is an event, it lists the event's open
markets and you pick the one your rule trades.

1. Set `VENUE=polymarket` and an exact binary Yes/No `MARKET_SLUG` (a
   polymarket.com link is not a slug: `npm run find-market -- <link>` turns it
   into one). You can create the Hive and run dry runs today.
2. **Live trading for a new Polymarket bot is not self-serve yet.** New
   Polymarket bots will trade from your own HiveTrade account: the bot signs the
   Call and HiveTrade places the order in your account. HiveTrade is still
   building that part. Until it is ready, there is nothing to fund for the bot.
   Never send money to the bot's signing address, never sign in to Polymarket as
   the bot, and never import the bot's key into a wallet app.

**Older bots only.** A bot created before this change trades from a deposit
wallet its operator set up and registered (**register the wallet**:
`npm run bind-wallet`, same as `npm run register-wallet`; see
[the protocol](docs/protocol.md)). That keeps working; new bots do not use it.
The starter does not redeem winnings. Follow the venue's eligibility rules; a
server does not change regional eligibility.

## 4. Implement your idea and preview it

Your agent should edit `strategy.mjs`. It receives a market with `question`,
`yesAsk` and `noAsk`, and returns either a skip (`null` or
`{ skip: true, reasons }`) or a trade (`{ side: "yes" | "no", maxPrice, reasons }`).
Prices are decimal probabilities: `0.40` means 40 cents. `maxPrice` is the highest
price the order may pay, and that price itself is allowed. `reasons` is optional:
a list of short text lines that the dry run prints as `TRACE` lines, so you can
see why your rule did or did not trade. The dry run also prints the market and
its asks as `TRACE` lines before your rule's own.

To try the illustrative rule, set `EXAMPLE_SIDE` and `EXAMPLE_MAX_PRICE`. Without
both, it skips or rejects configuration. This rule only demonstrates a price
limit: it has no predictive edge. Match any real data source to the market's
resolution rules. See [example ideas](strategy-playbook.md).

**Tests.** The example rule's tests are in `test/example-strategy.test.mjs`.
When you replace `strategy.mjs`, replace that file with tests for your own rule.
The other files in `test/` check the kit itself and never load `strategy.mjs`,
so they stay green whatever your rule is.

Preview it with a dry run:

```bash
npm run dry-run
```

`npm run dry-run` always runs with live trading off and without the signing key,
whatever `.env` says. It needs no Hive ID, so you can run it before you create
the Hive. (`npm start` does the same while `BOT_LIVE_TRADING_ENABLED=false`.)
A dry run fetches public market data and prints a decision. It submits **no intent,
order, or fill report**. It does not prove wallet funding, trading permissions, or
that a live order will fill.

## 5. Enable only when you intend to trade

Review the exact market, side, price cap, stake, strategy and venue account.
Set `BOT_LIVE_TRADING_ENABLED=true` locally and run `npm start` once. This can
place real orders and trigger follower copies. Check the venue receipt and Hive
Call together before considering the integration verified.

A successful API response alone is not proof of a fill. An uncertain result stops
the runner and leaves a journal entry for reconciliation. There are no automatic
order retries. See [recovery](docs/recovery.md) before restarting after a failure.

## Hosting and extending

**Today the guided server setup runs practice only.** The Railway helper
([guide](docs/railway.md), skill
[`skills/hivetrade-deploy/SKILL.md`](skills/hivetrade-deploy/SKILL.md)) deploys
scheduled **dry runs**: the server checks your market on a timer, with live
trading always off and no signing key. It cannot place real orders, even if you
change a setting on the server. Real trading works only on your own computer
today (step 5). Your decision trace (`TRACE` lines) shows only in local runs; the
server prints a short completion line instead, so your strategy's output never
reaches a host's logs.

Local execution stops when the computer sleeps or the process exits. Review the
host's current pricing before deploying: a server costs money even for practice.
`npm run railway -- plan <config>.json` checks a config before you have a Railway
project; `deploy` and `verify` then need the three Railway UUIDs. Keep your
strategy in a repository you control and choose its visibility deliberately.

Building your own live server setup is outside what this kit guides. If you do,
`railway.json` starts `node bot.mjs` from the host's environment variables and
disables automatic restarts (an uncertain trade must be reconciled, not
restarted in a loop). Use one runner instance and a persistent volume for
`STATE_DIR`: an empty new volume loses duplicate protection. You put the private
key in the host's secret settings yourself, never in a Dockerfile or Git
repository; your agent never copies it.

The runner is a one-shot job, not a web service: it has no `/health` endpoint
and will not trade the same market twice. For a continuous bot, your agent must
add market selection, fresh data, exposure and cumulative spending limits,
supervision, exit/settlement handling, and tests. Do not remove the execution
guards to make it run.

## Documentation and support

- [Public setup docs](https://docs.hivetrade.com/run-a-bot/custom)
- [HiveTrade docs: set up with your AI agent](https://docs.hivetrade.com/run-a-bot/agent)
- [Set up with an AI agent](docs/agent-setup.md)
- [Wire contract](docs/protocol.md)
- [Recovery and verification](docs/recovery.md)

Compatibility checked against HiveTrade's current API contract on 2026-09-15.
Offline tests and dry runs do not certify a funded live account. Report an issue
with redacted configuration and an error stage; never attach keys or full SDK logs.
