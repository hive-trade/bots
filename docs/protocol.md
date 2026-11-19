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

## Polymarket US (`pmus-v1`)

Polymarket US is a separate exchange from Polymarket, with its own accounts and
its own market slugs. A Polymarket US bot works like a Kalshi bot: it only signs
the Call (market, side and a price cap, with **no amount**), and HiveTrade places
the Captain order in the Hive owner's own Polymarket US account, staking the
Hive's Amount per Call within the Total budget the owner set. The runner holds
no Polymarket US key, places no order and posts no fill report.

**Prerequisites**, all done by the Hive owner in HiveTrade, never by the bot:

- The bot Hive is created with **Polymarket US** as its exchange. Polymarket US
  bot Hives always trade from the owner's own account; on an environment where
  that is not switched on, creating one is refused with
  `409 BOT_OPERATOR_MODEL_REQUIRED`.
- The owner's own Polymarket US account is connected in HiveTrade **Settings**,
  with an API key the owner creates at Polymarket US and enters there
  themselves. That key never goes in `.env`, in chat or in the bot.
- The Hive's Amount per Call and Total budget are set, and the bot is allowed to
  trade (while creating the Hive, or later in Studio). The money is in the
  owner's own Polymarket US account.

There is no mode check: the runner does not call `GET /api/bot/config` on this
path. HiveTrade checks every prerequisite when the signal arrives and answers a
skip code when one is missing.

`POST /api/bot/signal` with `{ signal, signature }`. The signal contains
`hiveId`, `venue: "polymarket_us"`, `polymarketUsSlug`, `side`, `signalStrength`
(always `100`), `limitPrice`, `execution: "hivetrade-v1"`, `nonce`, `issuedAt`,
and `intent: true`. No `stakeUsd`, no `conditionId`, no Kalshi field, no
`orderType`, `signedOrder` or `fillResult`: any of them is refused
(`400 PMUS_SIGNAL_MALFORMED`).

- `polymarketUsSlug` is the Polymarket US **market** slug (lower-case letters,
  digits and dashes), not the event slug. A `polymarket.us/event/<event>` page
  can hold many markets: `npm run find-market -- <polymarket.us link>` lists
  them, and `npm run find-market -- --us <slug>` checks one slug.
- `limitPrice` is the most the Captain order, and so every Member's copy, may pay
  per contract, in the traded side's own price space: a NO limit is a NO price,
  never 1 minus a YES price. Strictly between 0 and 1, at most 4 decimals. The
  example rounds your strategy's `maxPrice` down to the market's price step
  (`orderPriceMinTickSize`); HiveTrade also floors it onto that step.

The signed message is:

```text
HiveTrade bot signal pmus-v1
hive:<hiveId>
venue:polymarket_us
market:<polymarketUsSlug>
side:<yes|no>
signal:100
limitPrice:<limitPrice>
execution:hivetrade-v1
nonce:<nonce>
issuedAt:<issuedAt>
intent:true
```

A signal that sets the optional `positionDisclosure` field (`holds`, `intends`
or `none`; the example does not) signs one more line, `position:<value>`, right
before `nonce:`. `test/polymarket-us.test.mjs` pins these bytes, and their
signature, to the ones HiveTrade's own `botSignalMessage` builds.

Answers:

- `201 { accepted: true, id, marketId, venue: "polymarket_us", polymarketUsSlug,
  captainFill, captainFailure, fanout }`: the Call was made. An accepted Call is
  not a claim of a fill: check the Hive for the outcome.
- `200 { accepted: false, skipped: true, code }`: HiveTrade skipped the Call and
  wrote nothing. A skip does not use up the nonce, so the same signal may be sent
  again while it is fresh. Codes include:
  - `POLYMARKET_US_BOT_CAPTAIN_CREDENTIAL_UNAVAILABLE`: no usable Polymarket US
    key is connected for the Hive owner. `POLYMARKET_US_BOT_CAPTAIN_KEY_UNREADABLE`:
    HiveTrade could not read the stored key.
  - `BOT_OPERATOR_CONSENT_REQUIRED`: the bot is not allowed to trade for the
    current Amount per Call and Total budget. `BOT_AMOUNT_PER_CALL_UNAVAILABLE`:
    no usable Amount per Call. `BOT_TOTAL_BUDGET_REACHED`, `OPERATOR_CAPACITY_SHORT`,
    `OPERATOR_CAPACITY_UNAVAILABLE`: the Total budget, or the owner's cash outside
    every other budget, does not cover the Call.
  - `POLYMARKET_US_BOT_OPERATOR_REQUIRED`: the Hive has no owner account to trade
    from. `BOT_OPERATOR_INELIGIBLE`, `TRADING_PAUSED`, `HIVE_PAUSED`, `BOT_PAUSED`,
    `POLYMARKET_US_OPERATOR_GATE_UNAVAILABLE`: the owner's account or the Hive
    cannot trade right now.
  - `POLYMARKET_US_MARKET_NOT_FOUND`, `POLYMARKET_US_MARKET_CLOSED`,
    `POLYMARKET_US_MARKET_UNSUPPORTED`: the market slug is unknown, the market is
    closed, or its price step or contract size is one HiveTrade does not trade.
  - `POLYMARKET_US_BOT_PRICE_MOVED`: the side's live ask is above your
    `limitPrice`, or there is none. `POLYMARKET_US_BOT_AMOUNT_BUYS_NOTHING`: the
    Amount per Call buys less than one contract step at that price.
  - `POLYMARKET_US_EXCHANGE_PAUSED`: the exchange's weekly maintenance window
    (Thursday, 6:00 to 8:00 AM ET, from one minute before). `POLYMARKET_US_DISABLED`,
    `POLYMARKET_US_UNAVAILABLE`, `POLYMARKET_US_BOT_CAPTAIN_UNRESOLVED`: HiveTrade
    cannot trade on Polymarket US right now.

  Treat any other `code` the same way: nothing was placed for this signal.
- `409 CALL_ALREADY_OPEN` (with the open Call's `id`): the Hive already has an
  open Call on this market. `423 BOT_PAUSED`: the owner paused the bot. `401`: a
  stale, future-dated, replayed or badly signed signal. `400`: a malformed signal,
  or a Hive that is not a Polymarket US bot Hive.

A timeout is ambiguous: do not resend. HiveTrade may already have placed it. The
example keeps the journal entry unresolved, as on every other path.

**Market data** comes from the public gateway, `https://gateway.polymarket.us`,
with no key: `GET /v1/market/slug/<slug>` (`{ market }`),
`GET /v1/markets/<slug>/book` (`{ marketData: { bids, offers, state } }`) and
`GET /v1/events/slug/<event>` (`{ event: { markets } }`). Every price the
gateway returns is a YES price: the NO ask is 1 minus the best YES bid. Do not
read a market's `outcomes` or `outcomePrices`; their order is not fixed. The
gateway answers HTTP 429 to bursts (about seven reads in a second), so
`lib/polymarket-us.mjs` reads one request at a time, never in parallel, and
retries a 429 twice after a pause.

## Compatibility

Tests cover fixed wire vectors and example behavior. Integration code uses the
pinned official `@polymarket/clob-client-v2` SDK; no private package is imported.
See [Polymarket order status guidance](https://docs.polymarket.com/trading/manage-orders).
Do not silently change signing formats or upgrade trading SDKs without verifying
compatibility and the test suite.
