# Build your own HiveTrade bot

Give this repository to your AI coding agent. It contains an educational example,
setup tools, and the public integration code needed to publish Calls from **your
own strategy**. HiveTrade's production strategies and their tuning are not included.

HiveTrade is signal-sharing software for Polymarket and Kalshi. Trades execute in
participants' own venue accounts. Trading fees apply.

## Current API compatibility — 30 October 2026

This branch implements the legacy self-managed Polymarket flow and
amount-bearing Kalshi v2. It does **not** implement Polymarket `pm-op-v1` or
`pm-v3`, or the newer no-amount Kalshi shape. The operator-account update is
[pending in PR #15](https://github.com/hive-trade/bots/pull/15), not part of
current public main `19a73a7` or this branch. A new Polymarket Hive that trades
in its owner's account cannot run this starter live. Keep it in dry-run mode
until you have a compatible client; do not change the Hive mode or place a
local order to bypass a refusal.

**Kalshi amount check:** the API now sizes the Captain order from the Hive's
**Amount per Call**, within its **Total budget**, and ignores the legacy signed
stake and contract count for sizing. This starter still prints and checks a
local signed amount. Its `MAX_STAKE_USD` and printed `maximumStakeUsd` do not
cap the API-sized order. Check the Hive's actual amounts in Studio before any
live run; a lower local amount does not reduce them.

This is an educational starter for your own rules. It has no stock or
Polymarket US integration. Offline tests and dry runs do not prove live fills.

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

1. **Agent:** creates the bot's signing key on your computer and shows only its
   public address.
2. **Agent:** writes your strategy, runs the tests and a dry run.
3. **Agent:** prepares a pre-filled "Create a bot Hive" link.
4. **You:** open it, check the signing address, and press **Create bot Hive**.
5. **Agent:** reads the new Hive ID back with a request signed by the bot's key.
6. **You:** connect your Kalshi API key and consent, or fund the bot's Polymarket
   deposit wallet.
7. **You:** turn on live trading, only when you decide to.

Details, the tool reference and troubleshooting: [Set up with an AI agent](docs/agent-setup.md).

## What you get

- A small **user-selected side + maximum price** example, disabled until configured.
  It is a programming example, not a forecast or a promise of profit.
- Polymarket: bot-owned deposit wallet, signed intent, local order, actual fill report.
- Kalshi: signed v2 intent; HiveTrade executes using the operator's connected account.
  No Kalshi private key belongs in this runner.
- Local key creation, wallet binding, spending checks, persistent duplicate prevention,
  and tests that do not place real trades.

The runner checks **one exact market once, then exits**. Start here before adding
market discovery or a timed loop. It does not manage exits, wrapping, redemption,
or a portfolio. Polymarket wallet operations remain your responsibility through
the venue's supported tools. Kalshi handles settlement in your Kalshi account.

## 1. Install and create an identity

Requires Node.js 24+ and npm. Clone the **whole repository**, not a single script:

```bash
git clone https://github.com/hive-trade/bots.git my-bot
cd my-bot
npm ci
npm run setup
npm run check
npm test
```

`setup` creates `.env` with permissions `0600` and prints only the public address.
It refuses to overwrite an existing `.env`. Keep a private backup of the identity;
losing it may lose access to the associated wallet. Never commit `.env`, journal
files, or credentials. The example needs no access to HiveTrade's private repository.

## 2. Register the Hive

Only you can create the Hive, in your own signed-in browser. Your agent builds a
pre-filled link (MCP tool `prepare_registration`) and never submits it. Open it,
check that the **signing address** is exactly the one your agent showed you, tick
the Captain agreement and press **Create bot Hive**. The agent then reads the Hive
ID back (`check_registration`) or, if that lookup is not available yet, asks you
for the ID the page showed (`set_hive_id`). See [agent setup](docs/agent-setup.md).

Manual fallback: sign in at [Create a bot Hive](https://app.hivetrade.com/bots/new),
choose the venue, name the Hive, enter the **public signing address**, and set
`BOT_HIVE_ID` in `.env` yourself.

Set the Hive's Amount per Call and Total budget in the app. `MAX_STAKE_USD`
checks the locally constructed legacy signal; on Kalshi it does not cap the
API-sized Captain order.
The legacy daily-budget field is not an enforced daily spending limit.

**Polymarket execution mode.** This starter supports self-managed Hives: it
sends an intent, waits for `go: true`, places its own capped order and reports
the actual fill. It does not implement the newer `pm-v3` relay mode, mode
discovery or relay credential registration. Confirm the Hive's execution mode
before enabling live trading. If the API refuses with
`PM_CAPTAIN_EXECUTED_BY_HIVETRADE`, stop and use a compatible client; never
place a local fallback order. Kalshi v2 remains API-owned execution.

**How Members' copies are sized.** Each Member's copy of your Call is their own
per-call budget, in full, reduced only by their tier cap, what is left in their
Hive budget, and what the market can fill inside the Call's price limit. Your
bot's stake does not set it.

Production uses `https://api.hivetrade.com`; a Hive registered on dev uses
`https://api-dev.hivetrade.com`. Never mix environments. An API rejection is a
failed preflight, not permission to bypass a restriction.

## 3. Complete venue setup

### Kalshi

1. Set `VENUE=kalshi`.
2. Have an eligible, funded Kalshi account. Connect your Kalshi API key in
   HiveTrade Settings and complete the required execution consent. The venue key
   needs trade and internal-transfer permissions; it cannot withdraw.
3. Choose an exact currently open `KXBTC15M`, `KXETH15M`, or `KXSOL15M` ticker.
   These are the three series accepted by this starter. HiveTrade's API supports
   [more reviewed series](https://docs.hivetrade.com/run-a-bot/kalshi#markets-the-bot-api-accepts),
   but this runner does not implement them.
4. Set `KALSHI_TICKER` to that ticker and `KALSHI_CONTRACTS` to a positive whole
   contract count.
   The local legacy amount includes the standard fee estimate and must pass
   the starter's checks. The API ignores that signed amount and count for sizing:
   it uses the Hive's Amount per Call, in hundredths of a contract. Check the
   Hive's amounts separately before live trading.

Only the platform signing key goes in `.env`. HiveTrade submits the Captain order;
do not add a second local Kalshi order or a Polymarket-style fill report.

### Polymarket

1. Set `VENUE=polymarket`. Complete Polymarket's supported wallet setup using this
   bot's signing identity. The bot needs its **own deployed deposit wallet**, with
   tradable collateral and trading approvals; your human account's wallet is not
   a substitute. Follow [wallet setup](https://docs.polymarket.com/trading/wallets-auth).
2. Set `POLYMARKET_DEPOSIT_WALLET` to the deposit contract address, not the signing
   address. Complete funding/wrapping using Polymarket's supported tools.
3. Run `npm run bind-wallet` (alias: `npm run register-wallet`) to associate that wallet with this Hive. The API checks
   its on-chain owner. This is a setup write, not a trade.
4. Set an exact binary Yes/No `MARKET_SLUG` and `STAKE_USD`. The runner derives CLOB
   authentication locally and retrieves the public builder configuration from HiveTrade.

The starter does not deploy wallets, create approvals, wrap collateral or redeem
winnings. Those are separate prerequisites/maintenance tasks. Follow the venue's
eligibility rules; a server does not change regional eligibility.

## 4. Implement your idea and preview it

Your agent should edit `strategy.mjs`. It receives a market with `yesAsk` and
`noAsk` and returns `null` to skip or `{ side: "yes" | "no", maxPrice }`.
Prices are decimal probabilities: `0.40` means 40 cents.

To try the illustrative rule, set `EXAMPLE_SIDE` and `EXAMPLE_MAX_PRICE`. Without
both, it skips or rejects configuration. This rule only demonstrates a price
limit: it has no predictive edge. Replace it with the rule you describe before
live operation. The runner does not detect whether the example was replaced:
configured example settings can place orders when live trading is enabled.
Match any real data source to the market's resolution rules. See
[example ideas](strategy-playbook.md).

Keep `BOT_LIVE_TRADING_ENABLED=false`, then run:

```bash
npm start
```

A dry run fetches public market data and prints a decision. It submits **no intent,
order, or fill report**. It does not prove wallet funding, trading permissions, or
that a live order will fill. `npm run setup` and `bind-wallet` are separate commands.

## 5. Enable only when you intend to trade

Review the exact market, side, price cap, stake, strategy and venue account.
Set `BOT_LIVE_TRADING_ENABLED=true` locally and run `npm start` once. This can
place real orders and trigger follower copies. Check the venue receipt and Hive
Call together before considering the integration verified.

A successful API response alone is not proof of a fill. An uncertain result stops
the runner and leaves a journal entry for reconciliation. There are no automatic
submission or local-order retries in this runner. HiveTrade can continue filling
eligible copies within a fixed one-minute buy window; this is separate from
resubmitting the Call. See [the protocol](docs/protocol.md#buy-window-and-retries)
and [recovery](docs/recovery.md) before restarting after a failure.

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

- [Public setup docs](https://docs.hivetrade.com/run-a-bot/custom)
- [HiveTrade docs: set up with your AI agent](https://docs.hivetrade.com/run-a-bot/agent)
- [Set up with an AI agent](docs/agent-setup.md)
- [Wire contract](docs/protocol.md)
- [Recovery and verification](docs/recovery.md)

Documentation compatibility reviewed on 2026-10-30 against public main
`19a73a7` and HiveTrade's current API source. The limits above describe this
starter. Source review, offline tests and dry runs do not certify a deployment
or funded live account. Report an issue with redacted configuration and an error
stage; never attach keys or full SDK logs.

### Let an AI agent set up Railway hosting

Give your agent this repository and point it to
[`skills/hivetrade-deploy/SKILL.md`](skills/hivetrade-deploy/SKILL.md).
The [deployment guide](docs/railway.md) provides `plan`, `deploy` and `verify`
commands for a new Railway service, persistent storage and scheduled dry runs.
It uses your existing Railway CLI login and keeps live trading disabled.
