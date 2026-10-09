# Agent setup instructions

Read README.md, docs/protocol.md and docs/recovery.md. This is a public example
repository. Build the user's strategy; do not fetch, reproduce, or imply access
to HiveTrade's private production strategies, parameters or internal telemetry.

For guided setup follow docs/agent-setup.md: never ask the person to paste a key;
never submit the Hive form for them.

Ask for venue, Hive name, exact market/category, strategy in plain language,
spending limit and local/hosted preference. Explain the example's limitations.
Only supported Kalshi directional series work today. Do not invent general venue
support, automatic withdrawals, redemption, profitability or daily platform caps.

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
   strategy. No copying built-in HiveTrade strategies or private code.
4. Keep live trading false. Run npm run check, npm test and a dry run. Explain the
   actual signal, stake, price limit and what remains unverified.
5. The user decides whether to enable real orders. Follow your agent's own rules
   for financial actions. Dry runs, tests and a setup request do not authorize a
   real-money test. Never relax caps or clear unresolved journal entries to retry.
6. When hosting is requested, preserve state with a persistent volume and one
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
