# Set up your bot with an AI agent

Your AI agent can do most of the work of setting up a HiveTrade bot. A few steps
stay with you, on purpose: they decide which key can publish Calls for your Hive
and whether real orders are placed.

HiveTrade is signal-sharing software for Polymarket and Kalshi. Trades execute in
each participant's own venue account.

In Claude Code, install the plugin:

```text
/plugin marketplace add hive-trade/bots
/plugin install hivetrade-bot@hivetrade
```

It bundles two skills (`hivetrade-bot` for setup, `hivetrade-deploy` for Railway
hosting) and a local MCP server, `hivetrade-bot`, with the nine tools listed
below. Then ask your agent to "set up my HiveTrade bot". Other agents can use the
same server, see [Other MCP clients](#other-mcp-clients).

## Who does what

| Step | Who |
|---|---|
| Clone the kit and install dependencies | Agent |
| Create the bot's signing key (stays in `.env`, only the public address is shown) | Agent |
| Write your strategy in `strategy.mjs`, with tests | Agent |
| Run the tests and a dry run | Agent |
| Prepare the pre-filled "Create a bot Hive" link | Agent |
| Read the Hive ID back and save it to `.env` | Agent |
| Check the signing address on the form and press **Create bot Hive** | You |
| Tick the Captain agreement | You |
| Kalshi: connect your Kalshi API key in HiveTrade Settings and give the execution consent | You |
| Polymarket: deploy and fund the bot's own deposit wallet | You |
| Turn on live trading (`BOT_LIVE_TRADING_ENABLED=true`) | You |
| On a server: put the signing key in the host's secret settings | You |

## Step by step

1. **Status.** The agent calls `get_setup_status` to see what is already done.
2. **Kit.** Your project folder must be a clone of
   `https://github.com/hive-trade/bots` with `npm ci` run (Node.js 24+).
3. **Signing key.** The agent calls `create_signing_key`. It writes `.env` with
   permissions `0600` and returns only the public signing address. Keep a private
   backup of `.env`.
4. **Strategy.** The agent calls `list_strategies`, writes your rule in
   `strategy.mjs`, adds tests, and sets the market in `.env`.
5. **Dry run.** The agent calls `dry_run`. Live trading is forced off and the run
   gets no key. Before registration it uses a placeholder Hive ID.
6. **Registration link.** The agent calls `prepare_registration` with the name,
   venue and, optionally, description, category, per-call cap and environment.
   It gives you a link such as
   `https://app.hivetrade.com/bots/new?name=…&venue=kalshi&signer=0x…&maxStake=…&from=agent`.
   Nothing is submitted.
7. **You create the Hive.** Open the link in the browser where you are signed in
   to HiveTrade. Check that the signing address on the form is exactly the one
   your agent showed you. If it differs, stop. Review the rest, tick the Captain
   agreement and press **Create bot Hive**.
8. **Hive ID.** Tell the agent you are done. It calls `check_registration`, which
   asks HiveTrade with a request signed by the bot's key and saves `BOT_HIVE_ID`.
   If the lookup is not available, it asks you for the Hive ID the page showed and
   calls `set_hive_id`.
9. **Confirm.** The agent calls `get_bot_status` to check the Hive's name and venue.
10. **Venue setup (you).** Kalshi: connect your Kalshi API key in HiveTrade
    Settings and give the execution consent. Polymarket: deploy and fund the bot's
    own deposit wallet, set `POLYMARKET_DEPOSIT_WALLET`, then run
    `npm run bind-wallet`. The agent runs `dry_run` again.
11. **Hosting (optional).** The agent calls `get_deploy_guide` and follows the
    `hivetrade-deploy` skill. The hosted job is a scheduled preview with live
    trading off.
12. **Live trading (you).** Only you turn it on, and only when you decide to.

## MCP tool reference

Every tool works on the bot folder: `HIVETRADE_BOT_DIR` if set, else the Claude
Code project folder, else the current directory.

| Tool | What it does | Inputs | What it never does |
|---|---|---|---|
| `get_setup_status` | Reports which steps are done: kit, dependencies, `.env` and whether it is private, public signing address, venue, environment, Hive ID, Polymarket deposit wallet, market, live trading flag, and the next step. | none | Return a key or any other secret. |
| `create_signing_key` | Creates the signing key in `.env` (mode `0600`) and returns the public address. | none | Overwrite an existing `.env`, or show the key. |
| `prepare_registration` | Builds the pre-filled "Create a bot Hive" link for this bot's signing address. Saves `BOT_API_URL` for the chosen environment. | `name` (3 to 40 characters, required), `venue` (`polymarket` or `kalshi`, required), `bio` (up to 500 characters), `category` (one of the form's categories), `maxStakeUsd` (1 to 100), `environment` (`prod` or `dev`) | Submit the form. Switch environment for a bot that already has a Hive ID. |
| `check_registration` | Asks HiveTrade, with a request signed by the bot's key, whether the Hive exists. On success writes `BOT_HIVE_ID`, `BOT_API_URL` and `VENUE` to `.env`. | `environment` (optional) | Retry on its own, or change `.env` when the lookup fails. |
| `set_hive_id` | Writes `BOT_HIVE_ID` to `.env`. For when the automatic lookup is unavailable. | `hiveId` (whole number, 1 or more, required) | Write any other setting. |
| `get_bot_status` | Reads the Hive's public page data: name, handle, venue, member count, resolved Calls, page link, last Call. | `environment` (optional) | Sign anything or read private data. |
| `list_strategies` | Explains where the strategy goes and the generic example ideas in this kit. | none | Share HiveTrade's own production strategies (they are not in this kit). |
| `get_deploy_guide` | Explains hosting on Railway and who handles the key on a server. | none | Deploy anything or upload a key. |
| `dry_run` | Runs the bot once with live trading forced off and no key, and returns the last lines of its output. Lines that look like a key are hidden. | none | Submit an intent, order or fill report. |

No tool writes `BOT_PRIVATE_KEY`. Any tool output that looks like a private key
is refused rather than returned.

## Registration protocol

For people building their own client. The bot proves it controls its signing
address; no account credential is involved.

Request:

```http
POST /api/bot/whoami
Content-Type: application/json

{ "issuedAt": 1760000000000, "signature": "0x…" }
```

- `issuedAt` is Unix time in milliseconds. It must be within 5 minutes of
  HiveTrade's clock.
- `signature` is an EIP-191 `personal_sign` by the bot's signing key over the
  exact message `hivetrade:bot-whoami:<issuedAt>`, for example
  `hivetrade:bot-whoami:1760000000000`.

Responses:

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "hiveId", "name", "handle", "venue" }` | A bot Hive uses this signing address. |
| 404 | `{ "code": "BOT_NOT_REGISTERED" }` | No bot Hive uses this address yet. Wait until the person presses Create. |
| 404 without that code | | This API does not have the lookup yet. Ask the person for the Hive ID. |
| 401 | | The signature or time was rejected. Check the computer clock. |

On production, the lookup arrives with HiveTrade's next release. Until then,
`check_registration` reports it as unavailable and the agent uses `set_hive_id`.

The other signed endpoints are in the [wire contract](protocol.md).

## Security model

- The private key is created on your computer and stays in `.env` (mode `0600`).
  It never appears in tool output or chat. The agent never asks you to paste a key.
- The MCP server has no tool to post a Call, turn on live trading, move or add
  funds, or read an account credential.
- There is no agent account token. Registration needs no HiveTrade login from the
  agent: you create the Hive yourself, in your own signed-in browser.

**Why no token.** On Kalshi, a bot Hive's Captain orders run with your own
connected Kalshi key. Whoever controls a bot Hive's signing address can therefore
place orders in your Kalshi account. A token that let an agent create Hives would
let it attach any address to your account. Instead, you check and approve the
exact signing address each time, by pressing Create yourself.

## Environments

| | Web | API |
|---|---|---|
| Production (default) | `https://app.hivetrade.com` | `https://api.hivetrade.com` |
| Dev | `https://dev.hivetrade.com` | `https://api-dev.hivetrade.com` |

- `prepare_registration` saves the chosen environment as `BOT_API_URL` in `.env`,
  so the later lookup asks the same API.
- One signing address belongs to one Hive. To run a bot on the other environment,
  use a new bot folder with its own key. `prepare_registration` refuses to switch
  environment once `BOT_HIVE_ID` is set.

## Troubleshooting

- **The server shows as failed in `/mcp` on the first session.** The plugin
  installs its dependencies when the session starts, which can take about a
  minute. Reconnect `hivetrade-bot` in `/mcp` once it is done.
- **"Lookup unavailable".** The API does not have the signed lookup yet (production
  until HiveTrade's next release). Give the agent the Hive ID the page showed after
  Create; it calls `set_hive_id`.
- **`BOT_NOT_REGISTERED` after you pressed Create.** The signing address on the
  form was changed, or the Hive was created on the other environment. Compare the
  address with `get_setup_status` and check which site you used.
- **HTTP 401 from the lookup.** Usually a wrong computer clock. Sync the system
  time and try again.
- **"is not a copy of the bot kit".** Clone `https://github.com/hive-trade/bots`
  into the folder (or set `HIVETRADE_BOT_DIR`) and run `npm ci`.

## Other MCP clients

The server is a local stdio server. From your clone, after `npm ci`:

```bash
node mcp/server.mjs
```

It uses the current directory as the bot folder, or `HIVETRADE_BOT_DIR` if set.
In Claude Code without the plugin:

```bash
claude mcp add hivetrade-bot -- node mcp/server.mjs
```

Without any MCP server, an agent can follow
[`skills/hivetrade-bot/SKILL.md`](../skills/hivetrade-bot/SKILL.md) with the npm
scripts and build the same link by hand.
