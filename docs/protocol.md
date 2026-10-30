# Public bot protocol

`lib/protocol.mjs` defines the exact UTF-8 messages signed with EIP-191
`personal_sign`. Newlines are LF, there is no trailing newline, numeric values
use JavaScript decimal strings, and field order is fixed. Each signal/report uses
a fresh UUID nonce and Unix milliseconds. Keep system time synchronized.

Production origin: `https://api.hivetrade.com` (no trailing `/api`).
Dev origin: `https://api-dev.hivetrade.com`. Hive and signer must match that environment.

## Registration lookup

`POST /api/bot/whoami` with `{ issuedAt, signature }`, signing
`hivetrade:bot-whoami:<issuedAt>`, returns the Hive that uses this signing address.
See [agent setup](agent-setup.md#registration-protocol).

## Common preflight

`POST /api/bot/budget` with `{ issuedAt, signature }`, signing
`hivetrade:bot-budget:<issuedAt>`. Validate `hiveId` and `maxStakeUsd` from its
response. This does not reserve funds or guarantee acceptance. The API applies
its other authentication, venue, balance, consent and execution gates on submit.

## Polymarket

This section describes the legacy **self-managed** mode implemented here.
A Polymarket Hive executing in the owner's account requires `pm-op-v1`; a
bot-wallet Hive relaying pre-signed orders requires `pm-v3`. This starter
implements neither. Operator-mode support is pending in public PR #15; a
current-main update alone does not add it. The pm-v3 protocol signs a different
message, with
`execution: "hivetrade-v1"` and `signedOrder`, omitting the old `intent`,
`orderType` and `fillResult` fields. Adding an order to this starter's old
message is insufficient. Do not submit both protocols or fall back to a local
order after a refusal. The existing non-2xx/explicit-go checks stop safely
when a Hive rejects this mode.

`POST /api/bot/signal` with `{ signal, signature }`. The signal contains
`hiveId`, `venue: "polymarket"`, `conditionId`, `side`, `signalStrength`, `stakeUsd`,
`orderType: "marketable"`, `nonce`, `issuedAt`, and `intent: true`.

`signalStrength` is a fixed compatibility field of the signed message: always
send `100`, as the example does. HiveTrade ignores its value. Each Member's copy
is their own per-call budget, reduced only by their tier cap, what is left in
their Hive budget, and the depth available inside the Call's price limit.

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

## Buy window and retries

Every bot Call has a fixed one-minute buy window. HiveTrade can retry unfilled
eligible copies about every 15 seconds inside the same price band until the
window ends. An order with an unknown outcome must be reconciled before another
attempt for that leg. Its API-owned Kalshi Captain leg can participate. A locally placed
Polymarket Captain order is not retried by HiveTrade, and a pm-v3 Captain order
is not re-signed for another round. Bots do not select the six-hour Studio window.

This server behavior does not authorize a second signal submission. The starter
attempts each market once and stops on uncertain results. Preserve the journal
and reconcile the venue and Hive before doing anything further.

## One open Call per exchange market

A Hive cannot open a second unresolved Call on the same exchange market before
the Captain closes or sells the first, regardless of side. Stop buying or an
expired window does not free that slot. A duplicate may return
`CALL_ALREADY_OPEN` or a Polymarket `PM_CALL_ALREADY_OPEN` clean skip. Preserve
the journal; do not submit a local order or a fresh nonce to bypass the refusal.
There is no manual Add endpoint. Automatic original-window completion remains
server-owned, and the starter's once-per-market journal is stricter than the API.

## Kalshi

The signal includes `venue: "kalshi"`, `execution: "hivetrade-v1"`, `intent: true`,
`kalshiTicker`, `kalshiContracts`, `kalshiPriceCents`, plus common identity, side,
`signalStrength` (always `100`), stake, nonce and timestamp fields. The message prefix is
`HiveTrade bot signal kalshi-v2`. No Polymarket order fields are included.

The starter calculates its legacy signed amount locally as:

```
feeCents = ceil(7 * contracts * priceCents * (100 - priceCents) / 10000)
stakeUsd = (contracts * priceCents + feeCents) / 100
```

The current API verifies the legacy signed bytes but **does not size from that
stake or contract count**. It sizes from the Hive's Amount per Call, including
the fee multiplier it resolves for the market, in steps of 0.01 contract and
within the Hive's Total budget. The locally printed amount and `MAX_STAKE_USD`
do not cap this API-sized order. Verify the Hive's actual settings before a
live run.

The API also supports a no-amount Kalshi-v2 shape, omitting both `stake:` and
`contracts:` lines and their JSON fields; this starter does not emit it. Never
remove fields from a legacy signal after signing, or omit only one of the pair.

This starter accepts whole contract counts and only `KXBTC15M`, `KXETH15M`,
`KXSOL15M` tickers. The API accepts [more reviewed series](https://docs.hivetrade.com/run-a-bot/kalshi#markets-the-bot-api-accepts).
These are integration limits, not market recommendations.

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
