# Deploy an example bot to Railway with an AI agent

Give your agent this repository and ask:

> Follow skills/hivetrade-deploy/SKILL.md to deploy my example bot to a new Railway service. Use my existing Railway CLI login. Help me select the project, environment, market and schedule, then verify a hosted dry run.

This helper sets up **scheduled previews**. It does not sign in to HiveTrade,
transfer private keys or enable live trading. It contains no private HiveTrade
strategy. A successful preview proves the example ran and could write to the
attached volume; it does not prove trading profitability or live execution.

## Prerequisites

- Node.js 24+, `npm ci`, and the Railway CLI (tested command interface: 5.47.1).
- An existing Railway CLI login (`railway whoami`). Authenticate directly with
  Railway if needed; never paste login tokens into an agent conversation.
- A **new empty service** in your chosen Railway project and environment. Create
  it in Railway's dashboard, then copy all three UUIDs from its settings/URLs.
  Do not use the HiveTrade API service or any existing bot service.
- Your own strategy in `strategy.mjs`, an actual Hive ID and an open supported
  market. Read the main README for local setup. A preview needs no bot key.

## Configure and review

Copy `deploy/railway.example.json` to a local JSON file and replace the placeholders.
This file holds **public configuration only**, never `.env` contents or credentials.
For Kalshi set `VENUE=kalshi` and `KALSHI_TICKER` to an open exact supported ticker;
remove `MARKET_SLUG`. Values inside `variables` are strings.

```sh
npm run railway -- plan deploy/railway.local.json
npm test
```

Choose `intervalMinutes` from 5, 10, 15, 20, 30 or 60. Schedules run in UTC.
Railway cron is approximate and can vary by minutes; it is unsuitable for precise
market timing. The starter selects one **fixed market** and exits. It does not
roll to the next market automatically. Once that market closes, choose another
market or implement your own discovery logic before operating a continuing bot.
The default strategy skips unless you configure `EXAMPLE_SIDE` and
`EXAMPLE_MAX_PRICE`; a skip is a valid preview result.

## Deploy and verify

```sh
npm run railway -- deploy deploy/railway.local.json
npm run railway -- verify deploy/railway.local.json DEPLOYMENT_UUID
```

Deploy checks your CLI login and exact destination, attaches a `/data` volume if
needed, sets only public variables, and uploads a temporary runtime bundle. It
creates billable Railway resources in the service you selected. It never uploads
`.env`, local state, `.git`, tests or `node_modules`. Runtime files are `bot.mjs`,
`strategy.mjs`, `lib/*.mjs`, package manifests and the preview wrapper; extra custom
assets are not included. Keep credentials out of code and package URLs as well.
Dependency installation uses the lockfile and disables install scripts.

The generated deployment uses Node 24, one replica, no automatic restart, the
selected cron interval and `/data/hivetrade` for persistent state. There is no HTTP
health endpoint. The wrapper forces dry-run mode, supplies no signing credentials,
checks volume writes, and limits each preview to two minutes. It prints a compact
completion marker rather than forwarding potentially sensitive strategy output.

An upload acknowledgment is **not verification**. Wait for the build and a scheduled
run, then run `verify` with the returned deployment UUID. Exit 0 means a completed
preview marker was found for that deployment; exit 2 means it is not verified yet;
exit 1 means an error. Inspect build/runtime logs in Railway if it fails. A failed
market lookup can mean the fixed market has closed. Avoid sharing raw logs with
secrets. Re-run verification after the issue is resolved.

The helper deliberately refuses to overwrite existing deployments. If an upload
fails or its result is unknown, inspect the service first; do not repeatedly deploy
or create replacement services. Volume/variable changes may already have succeeded.
For subsequent changes, manage that service directly in Railway with the same
persistent volume and single-run constraints. Remove the service/volume yourself
when you no longer need the preview to stop ongoing resource usage.

## Moving beyond the preview

This is the hosting setup step. It does not add live trading controls. Follow
[the main README](../README.md) and [recovery rules](recovery.md) when separately
implementing and authorizing live operation. Preserve the journal and lock, never
run multiple instances, and never resolve an unknown trade outcome by restarting.
Changing a variable to `true` on this generated preview service **does not enable
trading**: its wrapper always overrides that flag.

References: [Railway cron jobs](https://docs.railway.com/cron-jobs),
[CLI volumes](https://docs.railway.com/cli/volume),
[CLI variables](https://docs.railway.com/cli/variable).
