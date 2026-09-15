# Verify and recover

## Before a live attempt

Run `npm run check` and `npm test`. Preview the exact market using dry-run mode.
Confirm the selected venue, signer registration, Hive ID, account/wallet, maximum
stake and price limit. Dry runs do not authenticate or place trades.

## After a live attempt

`state/journal.json` records each attempt before its first signal submission.
It contains no private key. Keep it private because it records trading activity.
Compare the returned market ID with the Hive Call and actual venue order/fill.
Do not equate `accepted` or an order ID with a completed fill.

The runner refuses a market it previously attempted and refuses ALL new live
attempts while any journal entry is unresolved. Do not delete the state directory
to get around this. It also takes an atomic `runner.lock` directory to reject a
second concurrent process. A process crash can leave the lock behind.

### Intent submission timed out

The server may have accepted the signal and started orders. Check the Hive and
venue before any retry. Do not send a new nonce or a compensating order.

### Polymarket order uncertain

Inspect the actual account's orders and fills using the venue's supported tools.
A delayed/live order, rejected request or network failure is not enough evidence
to report a fill or no-fill. Do not fire another Captain order. Preserve the
journal, exact market ID and any returned order ID for support.

### Fill report timed out

The venue order may already be filled and the API may have recorded the report.
The journal stores the fill data before reporting. Reconcile the Hive position
before deciding whether a report-only retry is needed; never repeat the trade.
The starter deliberately provides no automatic retry/recovery command.

### Kalshi accepted but fill not confirmed

HiveTrade owns the order and reconciliation. Check its returned Captain outcome
and the connected Kalshi account. Do not submit a local order or use Polymarket's
fill endpoint to resolve it.

### Clearing a resolved incident

Only after checking both HiveTrade and the venue, back up the journal and record
what actually happened. A qualified operator can mark that entry `complete` with
a reconciliation note. Keep its market key to prevent duplicate submissions.
Remove a stale lock only after confirming no other process is running. Restore
the same journal volume after deployments. Multiple independent volumes are not safe.

## Scope of verification

Automated tests use local fixtures and never place trades. A successful build or
dry run does not validate a user's funding, eligibility, permissions or live fills.
Live verification is a separate user decision involving real funds.
