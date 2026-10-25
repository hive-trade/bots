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
2. Ask me a few questions: Polymarket or Kalshi, my bot's name, my strategy
   idea in plain words, the most it may spend per Call, and whether it should
   run on this computer or on a server.
3. Create the bot's signing key. Never show me the private key or put it in chat.
4. Turn my idea into the bot's rule, run the tests, and show me a dry run.
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
6. **You:** Kalshi: connect your Kalshi API key and consent. Polymarket: send
   funds to the bot's deposit wallet. HiveTrade creates that wallet when you press
   Create and shows its address; `npm run wallet` prints it too.
7. **You:** turn on live trading, only when you decide to.

Details, the tool reference and troubleshooting: [Set up with an AI agent](docs/agent-setup.md).

## What you get

- A small **user-selected side + maximum price** example, disabled until configured.
  It is a programming example, not a forecast or a promise of profit.
- Polymarket: a deposit wallet for the bot, created by HiveTrade with the Hive;
  signed intent, local order, actual fill report.
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

Set the Hive's per-call cap in the app and `MAX_STAKE_USD` locally.
The legacy daily-budget field is not an enforced daily spending limit.

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

1. Set `VENUE=polymarket`. When you press **Create bot Hive**, HiveTrade creates
   the bot's own deposit wallet and shows its address. You do not need to visit
   Polymarket or import the bot's key into a wallet app; never do that.
2. Your agent saves the address as `POLYMARKET_DEPOSIT_WALLET` in `.env`
   (`check_registration` does this). `npm run wallet` prints it. If the kit
   cannot read it yet, copy it from the Hive page. It is the deposit wallet, not
   the signing address.
3. Send funds to that deposit wallet address, as the Hive page explains. Never
   send funds to the signing address.
4. Set an exact binary Yes/No `MARKET_SLUG` and `STAKE_USD`. The runner derives CLOB
   authentication locally and retrieves the public builder configuration from HiveTrade.

Bots created before HiveTrade made the wallet for you used `npm run bind-wallet`
to register a wallet they set up themselves. That still works; new bots do not
need it. The starter does not redeem winnings. Follow the venue's eligibility
rules; a server does not change regional eligibility.

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

Local execution stops when the computer sleeps or the process exits. A server
can run scheduled checks while your computer is off; review the host's current
pricing and job schedule before deploying. Keep your strategy in a repository
you control and choose its visibility deliberately.

`railway.json` starts `node bot.mjs` using the host's environment variables, so
no uploaded `.env` file is needed. It disables automatic restarts: an uncertain
trade must be reconciled, not restarted in a loop. Node 24+ is declared in
`package.json`. Set up a persistent volume and scheduling explicitly; this config
does not turn the one-shot example into a continuous strategy.

Use one runner instance and a persistent volume for `STATE_DIR`. A redeploy must
keep the journal; an empty new volume loses duplicate protection. Configure
secrets through your hosting provider's secret settings, never a Dockerfile or
Git repository. Moving the private key to a server is an explicit user choice.

The included command is a one-shot job, not a web service: it has no `/health`
endpoint. A scheduler may invoke it periodically, but it intentionally will not
trade the same market twice. For a continuous bot, your agent must add market
selection, fresh data, exposure and cumulative spending limits, supervision,
exit/settlement handling, and tests. Do not remove the execution guards to make it run.

## Documentation and support

- [Public setup docs](https://hivetrade-docs.vercel.app/run-a-bot/custom)
- [HiveTrade docs: set up with your AI agent](https://docs.hivetrade.com/run-a-bot/agent)
- [Set up with an AI agent](docs/agent-setup.md)
- [Wire contract](docs/protocol.md)
- [Recovery and verification](docs/recovery.md)

Compatibility checked against HiveTrade's current API contract on 2026-09-15.
Offline tests and dry runs do not certify a funded live account. Report an issue
with redacted configuration and an error stage; never attach keys or full SDK logs.

### Let an AI agent set up Railway hosting

Give your agent this repository and point it to
[`skills/hivetrade-deploy/SKILL.md`](skills/hivetrade-deploy/SKILL.md).
The [deployment guide](docs/railway.md) provides `plan`, `deploy` and `verify`
commands for a new Railway service, persistent storage and scheduled dry runs.
It uses your existing Railway CLI login and keeps live trading disabled.
