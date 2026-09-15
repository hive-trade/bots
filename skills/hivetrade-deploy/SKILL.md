---
name: hivetrade-deploy
description: Deploy the user's HiveTrade example bot to a new Railway service with scheduled dry runs, persistent storage and deployment verification. Use for server setup or Railway hosting of this public starter.
---

# Railway bot setup

Read [AGENTS.md](../../AGENTS.md), [README.md](../../README.md), and
[the deployment guide](../../docs/railway.md) from this repository/ref.
Use the existing setup skill for the user's strategy and local bot configuration.

1. Identify the user's Railway project, environment and new empty service UUIDs,
   venue, Hive ID, exact open market and desired interval. Reuse choices already
   given. Explain that deployment creates billable hosting/storage. Do not select
   an existing production service. Use their existing CLI authentication; never
   request login tokens or read `.env` into tool output/chat.
2. Create a public JSON config from `deploy/railway.example.json`. It must contain
   no credentials. Run `npm ci`, `npm test`, and the helper's `plan` command. Check
   the strategy has no private HiveTrade logic and needs only supported runtime files.
3. When deployment is within the user's request, run the helper's `deploy` command.
   It provisions a volume and uploads a scheduled preview; it always keeps live
   trading disabled. Do not replace it with `railway up` from the full repository.
4. Record the returned deployment UUID. Run `verify` against that UUID after build
   and a scheduled execution. Pending/uploaded is not successful verification.
   Report failure honestly. If the upload outcome is unknown, inspect Railway
   before retrying; the service or volume may already exist.
5. Report the destination, schedule, verification evidence and remaining work.
   Remind the user that this is a scheduled preview of a fixed market, and that
   market rollover and live operation are separate implementation decisions.

Do not obtain bot keys, invoke live orders, expose full remote logs, or modify an
existing service as an implicit hosting test. The script intentionally has no live
trading switch. Use the guide's recovery instructions for partial setup failures.
