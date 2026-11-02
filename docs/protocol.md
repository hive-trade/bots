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
`hivetrade:bot-budget:<issuedAt>`. Validate `hiveId` from its response;
`maxStakeUsd` is the Hive's Amount per Call, what each Call stakes. Its daily-budget fields (`dailyBudgetUsd`, `remainingUsd`) are legacy
figures and limit nothing; do not show them as a limit. This does not reserve
funds or guarantee acceptance. The API applies
its other authentication, venue, balance, consent and execution gates on submit.

It is also the status check after registration: it answers for the signer's own
Hive even when that Hive is Private, which the public `GET /api/hives/<id>` cannot
see. HTTP 401 with `signer is not a registered bot` means no Hive uses this
signing address on that environment.

## Mode check

`GET /api/bot/config` with headers `x-bot-signature`, `x-bot-issued-at` and
`x-bot-capabilities: pm-op-v1`, signing
`hivetrade:bot-config:<issuedAt>:capabilities:pm-op-v1` (with no capabilities
header, the message is `hivetrade:bot-config:<issuedAt>`). It answers
`{ hiveId, venue, pmCaptainExecution, signalVersion }`. The declaration is part
of the signed bytes; HiveTrade moves a Hive to `operator` only after its bot
declared `pm-op-v1`. The runner signs a Polymarket Call only when the answer is
`operator`.

## Polymarket (`pm-op-v1`, every new bot)

The bot only signs the Call: market, side and a price cap, with **no amount**.
HiveTrade places the Captain order in the Hive owner's own HiveTrade account,
exactly like a Call the owner places, staking the Hive's Amount per Call within
the Total budget the owner set. The runner has no
wallet, no order code and no Polymarket credentials on this path.

`POST /api/bot/signal` with `{ signal, signature }`. The signal contains
`hiveId`, `venue: "polymarket"`, `conditionId`, `side`, `signalStrength`,
`limitPrice`, `execution: "hivetrade-operator-v1"`, `nonce`, `issuedAt`, and
`intent: true`. No `stakeUsd`. `limitPrice` is the highest price per share
(strictly between 0 and 1, on the market's tick, at most 4 decimals); no Member
copy pays more either. No `orderType`, `signedOrder` or `fillResult`; any of
them is refused (`400 PM_OP_SIGNAL_MALFORMED`). The signed message is:

```text
HiveTrade bot signal pm-op-v1
hive:<hiveId>
venue:polymarket
condition:<conditionId>
side:<yes|no>
signal:100
limitPrice:<limitPrice>
execution:hivetrade-operator-v1
nonce:<nonce>
issuedAt:<issuedAt>
intent:true
```

Answers: `201` with the Call's `marketId` (an accepted Call is not a claim of
a fill: check the Hive); `200 { skipped: true, code }` when HiveTrade skipped
the Call and wrote nothing (for example `BOT_TOTAL_BUDGET_REACHED`, or
`PM_OPERATOR_EXECUTION_NOT_ENABLED`); `409 PM_CAPTAIN_EXECUTED_BY_HIVETRADE`
when the Hive trades from the owner's account and received another signal shape.
A timeout is ambiguous: do not resend. HiveTrade may already have placed it.

An early exit is `POST /api/bot/exit` with `{ request, signature }`, `request` =
`{ hiveId, conditionId, side, execution: "hivetrade-operator-v1", nonce,
issuedAt }`, signed over `HiveTrade bot exit pm-op-v1` / `hive:` / `venue:polymarket` /
`condition:<lowercase>` / `side:` / `execution:hivetrade-operator-v1` / `nonce:` /
`issuedAt:` (one per line, `lib/protocol.mjs` `exitMessage`). HiveTrade sells the
Captain position and the Hive's Members. The one-shot runner does not use it.

`signalStrength` is a fixed compatibility field of the signed message: always
send `100`, as the example does. HiveTrade ignores its value. Each Member's copy
is their own per-call budget, reduced only by their tier cap, what is left in
their Hive budget, and the depth available inside the Call's price limit.

## Polymarket legacy (older self-managed bots only)

Only a bot created before the change above, with
`POLYMARKET_LEGACY_SELF_MANAGED=true`, uses this path. It goes away once every
older bot has moved. The signal contains `hiveId`, `venue: "polymarket"`,
`conditionId`, `side`, `signalStrength`, `stakeUsd`, `orderType: "marketable"`,
`nonce`, `issuedAt`, and `intent: true`.

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

Register the wallet (`npm run bind-wallet`, same as `npm run register-wallet`),
for bots created before that, whose operator set up the wallet:
`POST /api/admin/bot/register-wallet` with
`{ hiveId, walletAddress, issuedAt, signature }`; sign
`hivetrade:bot-register-wallet:<hiveId>:<lowercase-wallet>:<issuedAt>`.
This route uses the bot signature despite its `/admin` prefix.

## Kalshi

The signal includes `venue: "kalshi"`, `execution: "hivetrade-v1"`, `intent: true`,
`kalshiTicker`, `kalshiPriceCents` (the highest price per contract), plus common
identity, side, `signalStrength` (always `100`), nonce and timestamp fields. It
carries **no amount**: no `stakeUsd` and no `kalshiContracts`. The signed message is:

```text
HiveTrade bot signal kalshi-v2
hive:<hiveId>
venue:kalshi
ticker:<kalshiTicker>
side:<yes|no>
signal:100
priceCents:<kalshiPriceCents>
execution:hivetrade-v1
nonce:<nonce>
issuedAt:<issuedAt>
intent:true
```

HiveTrade sizes the Captain order from the Hive's Amount per Call: the most
hundredths of a contract whose cost plus Kalshi's fee fit it, at most at
`kalshiPriceCents`, within the Hive's Total budget. An older bot that still
signs `stake:` and `contracts:` lines (after `signal:`) keeps verifying; one
of the two without the other is refused. Only tickers in the series listed at
https://docs.hivetrade.com/run-a-bot/kalshi pass the API's gate.

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
