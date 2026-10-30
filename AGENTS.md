# Agent setup instructions

Read README.md, docs/protocol.md and docs/recovery.md. Start with the README's
current compatibility notice: this client cannot execute an operator-mode
Polymarket Hive, and its local Kalshi amount is not the API's execution cap.
Do not treat a pending pull request as installed support. This is a public example
repository. Build the user's strategy; do not fetch, reproduce, or imply access
to HiveTrade's private production strategies, parameters or internal telemetry.

For guided setup follow docs/agent-setup.md: never ask the person to paste a key;
never submit the Hive form for them.

Ask for venue, Hive name, exact market/category, strategy in plain language,
spending limit and local/hosted preference. Explain the example's limitations.
This starter accepts only KXBTC15M, KXETH15M and KXSOL15M tickers and whole
contract counts. The API supports more series and hundredths of a contract;
do not describe those as implemented by this starter. Do not invent general
venue support, automatic withdrawals, redemption, profitability or daily caps.

1. Use Node 24+, npm ci, npm run setup. Never read .env into tool output or chat.
   Show only the public address. Never upload or commit credentials/state.
2. Registration: build the pre-filled `/bots/new` link for the local signer
   (MCP `prepare_registration`). The user opens it, checks the signing address,
   ticks the agreement and presses Create; you never submit it. Then read the Hive
   ID with the signed lookup (MCP `check_registration`); if the API lacks it, ask
   for the ID the page showed (`set_hive_id`). The manual form is the fallback.
   The user performs account consent, the Kalshi key connection, wallet setup and
   funding in the appropriate app. Never request a private key in chat.
3. Implement the user's rule in strategy.mjs. Keep execution separate from the
   strategy. No copying built-in HiveTrade strategies or private code. Replace
   the placeholder before live operation; there is no runtime guard that checks
   whether it was replaced, and configured example settings can place orders.
4. Confirm the execution mode. This example supports self-managed Polymarket
   Hives and Kalshi v2. It does not implement Polymarket pm-v3 relay mode,
   mode discovery or relay credential registration. A
   PM_CAPTAIN_EXECUTED_BY_HIVETRADE refusal means stop and use a compatible
   client; never place a local fallback order or change the Hive's mode as a workaround.
5. Keep live trading false. Run npm run check, npm test and a dry run. Explain the
   actual signal, stake, price limit and what remains unverified.
6. The user decides whether to enable real orders. Follow your agent's own rules
   for financial actions. Dry runs, tests and a setup request do not authorize a
   real-money test. Never relax caps or clear unresolved journal entries to retry.
   The API's fixed one-minute buy window is separate from runner retries: it can
   retry eligible copies and its Kalshi Captain leg, but does not repeat this
   starter's local Polymarket Captain order. Never resubmit to emulate that window.
7. When hosting is requested, preserve state with a persistent volume and one
   instance. Explain the key will reside on that host and use its secret store.

Changes to protocol/execution require tests for failure and ambiguous responses,
not just successful orders. Update docs when behavior changes. This repo must
remain usable without the private HiveTrade monorepo.

## Claude Code plugin and MCP server

`/plugin marketplace add hive-trade/bots`, then `/plugin install hivetrade-bot@hivetrade`.
The guided flow is `skills/hivetrade-bot/SKILL.md`. Other MCP clients: `node mcp/server.mjs`
(stdio; bot folder = current directory or `HIVETRADE_BOT_DIR`). The server must never return
`.env` contents or a key, post a Call, enable live trading, fund, or read an account
credential. Tool changes need tests in `test/mcp.test.mjs` proving that.

For Railway server setup, follow `skills/hivetrade-deploy/SKILL.md` and
`docs/railway.md`. Use the public-config deployment helper for scheduled previews.
