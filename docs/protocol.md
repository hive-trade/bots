# Public bot protocol

`lib/protocol.mjs` defines the exact UTF-8 messages signed with EIP-191
`personal_sign`. Newlines are LF, there is no trailing newline, numeric values
use JavaScript decimal strings, and field order is fixed. Each signal/report uses
a fresh UUID nonce and Unix milliseconds. Keep system time synchronized.

Production origin: `https://api.hivetrade.com` (no trailing `/api`).
Dev origin: `https://api-dev.hivetrade.com`. Hive and signer must match that environment.

## Common preflight

`POST /api/bot/budget` with `{ issuedAt, signature }`, signing
`hivetrade:bot-budget:<issuedAt>`. Validate `hiveId` and `maxStakeUsd` from its
response. This does not reserve funds or guarantee acceptance. The API applies
its other authentication, venue, balance, consent and execution gates on submit.

## Polymarket

`POST /api/bot/signal` with `{ signal, signature }`. The signal contains
`hiveId`, `venue: "polymarket"`, `conditionId`, `side`, `signalStrength`, `stakeUsd`,
`orderType: "marketable"`, `nonce`, `issuedAt`, and `intent: true`.

Only an explicit `go: true` with a valid returned `id` authorizes the local Captain
order. `go: false` means do not fire. A timeout is ambiguous; do not retry with a
new nonce. The API may already have started follower orders.

The bot submits its own capped FAK BUY using its own deposit wallet. It then posts
`{ fill, signature }` to `/api/bot/signal/<id>/fill`. The fill contains `hiveId`,
`marketId`, `fillResult`, fresh `nonce` and `issuedAt`. Real fill quantities—not
requested amounts—populate `filledUsd`, `sizeShares` and `avgPrice`.

The example reports only an explicit matched response with real quantities.
Delayed/live responses, HTTP errors, network failures and malformed responses
halt for reconciliation. An order ID alone is not evidence of a fill. API-owned
follower orders can remain even when the Captain fails: never report a fabricated
no-fill or assume everything was canceled.

Wallet binding: `POST /api/admin/bot/register-wallet` with
`{ hiveId, walletAddress, issuedAt, signature }`; sign
`hivetrade:bot-register-wallet:<hiveId>:<lowercase-wallet>:<issuedAt>`.
This route uses the bot signature despite its `/admin` prefix.

## Kalshi

The signal includes `venue: "kalshi"`, `execution: "hivetrade-v1"`, `intent: true`,
`kalshiTicker`, `kalshiContracts`, `kalshiPriceCents`, plus common identity, side,
strength, stake, nonce and timestamp fields. The message prefix is
`HiveTrade bot signal kalshi-v2`. No Polymarket order fields are included.

The API currently checks stake against:

```
feeCents = ceil(7 * contracts * priceCents * (100 - priceCents) / 10000)
stakeUsd = (contracts * priceCents + feeCents) / 100
```

This is the API's signed maximum-cost contract, not a universal venue fee schedule.
Only supported `KXBTC15M`, `KXETH15M`, `KXSOL15M` tickers pass the current API gate.

HiveTrade owns execution through the operator's connected credential. The runner
never holds that credential, places a second order, or posts a fill report. An
`accepted: true` response is distinct from `captainFill.filled: true`. Unknown
outcomes require checking the Hive and venue account.

## Compatibility

Tests cover fixed wire vectors and example behavior. Integration code uses the
pinned official `@polymarket/clob-client-v2` SDK; no private package is imported.
See [Polymarket order status guidance](https://docs.polymarket.com/trading/manage-orders).
Do not silently change signing formats or upgrade trading SDKs without verifying
compatibility and the test suite.
