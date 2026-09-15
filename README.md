# Run a self-managed Polymarket bot on HiveTrade

This repository is the small, standalone reference runner for a public HiveTrade
bot. The bot signs with a key that stays on your machine, trades from its own
Polymarket deposit wallet, and sends HiveTrade a signed intent before it trades.
HiveTrade fans that intent out to followers and accepts the bot's signed fill
report afterward.

The starter is safe by default: `strategy()` always returns `null`, so it cannot
place an order until you deliberately implement and review a strategy. Its mock
tests never contact a venue or place a real trade.

> Real money is involved after you enable a strategy and start the runner with a
> funded wallet. Losses are public. Start small and never risk money you cannot
> afford to lose.

## Before you start

You need Node.js 20.10 or newer and a HiveTrade bot Hive. If an assistant is
helping, answer these five questions first:

1. Bot name (3–40 characters).
2. Polymarket niche or markets it will watch.
3. Strategy rule and the data source that matches the market's resolution source.
4. Stake per call (start with `$1`).
5. Run locally first, or deploy after local verification.

Create the bot Hive at [app.hivetrade.com/bots/new](https://app.hivetrade.com/bots/new).
The signing address is public. The private key is not: generate it locally, keep
it only in `.env` or your host's secret store, and never paste it into chat,
logs, a Git commit, or a HiveTrade request.

## Clean setup

```bash
git clone https://github.com/hive-trade/bots.git
cd bots
npm ci
cp .env.example .env
npm test
```

Generate a fresh signer locally if you do not already have one:

```bash
node --input-type=module -e 'import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"; const key = generatePrivateKey(); console.log("ADDRESS:", privateKeyToAccount(key).address); console.log("PRIVATE KEY (save locally; never share):", key)'
```

Add the address when creating the bot Hive. Put the secret key and returned Hive
ID in `.env`.

## Polymarket wallet setup

The signer EOA cannot be used as the funded maker. Deploy the bot's own
Polymarket `POLY_1271` deposit wallet with the official Polymarket factory
workflow, fund that deposit wallet with USDC on Polygon, and put its address in
`BOT_DEPOSIT_WALLET`. The on-chain owner must be `BOT_PRIVATE_KEY`'s address.

Then register that wallet with HiveTrade:

```bash
npm run register-wallet
```

Registration signs exactly:

```text
hivetrade:bot-register-wallet:<hiveId>:<walletAddress-lowercase>:<issuedAt>
```

The API independently checks the deployed wallet's owner. It receives the
address and signature, never the private key.

The full wallet sequence is documented in the maintained runner guide:

- [Generate a signing key](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/generate-key.md)
- [Create Polymarket credentials](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/polymarket-api-key.md)
- [Deploy the deposit contract](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/deposit-contract.md)
- [Fund the deposit wallet](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/fund.md)
- [Common mistakes](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/gotchas.md)

## Configure and run

`.env.example` defaults to the production API. A Hive created on development
must instead use `https://api-dev.hivetrade.com`; environments cannot be mixed.

Edit `strategy(market)` in `examples/bot-starter/bot.mjs`. It must return
`"yes"`, `"no"`, or `null`. Keep it returning `null` until its rule, data source,
and resolution-source match have been tested. Update `findMarket()` if you need
more than one slug or an external fair-value source.

Run locally:

```bash
npm start
```

Only after the mock suite passes and you have reviewed the strategy should you
allow the funded runner to continue. Verify the first call and its captain fill
on `https://app.hivetrade.com/hive/<id>`. Stop the process to pause the bot.

For 24/7 hosting, import this repository into Railway (or another Node host),
copy every `.env` key into the host's secret store, and use `npm start`. The
included `railway.json` uses that command. See the [hosting
guide](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/railway.md)
before enabling live execution.

## The current two-phase contract

The starter implements the public signal-first contract directly:

1. Build an intent with `intent:true`, a unique nonce, and a millisecond timestamp.
2. Sign the exact `botSignalMessage()` bytes with EIP-191 `personal_sign`.
3. `POST /api/bot/signal` with `{ signal, signature }`.
4. Place the bot's own `FAK` taker order only after `201 { go:true, id }`.
5. Report the actual order ID, filled USDC, and shares in a signed
   `POST /api/bot/signal/:marketId/fill`.

Rejections, stale timestamps, and replayed nonces never reach the order seam.
A failed or rejected venue order is reported as `filled:false`; the runner does
not invent a fill. HiveTrade independently reconciles reported Polymarket fills
before using them as a verified public record. The API's builder code is fetched
from `GET /api/bot/builder-config` and stamped on the order when configured.

The canonical message helpers are pinned to the referenced HiveTrade revision in
the starter file. Do not reorder, rename, omit, or stringify their fields
differently. The tests recover both signatures and exercise acceptance,
rejection/replay, truthful failure reporting, registration, and secret omission.

For a custom implementation or another language, read the [developer
contract](https://github.com/hive-trade/hivetrade/blob/dev/docs/bots/developer-guide.md).
Kalshi uses a different, API-owned execution contract; follow the [Kalshi bot
guide](https://github.com/hive-trade/hivetrade/blob/dev/apps/docs/run-a-bot/kalshi.md)
instead of adapting this Polymarket runner.

## Strategy notes

Use [strategy-playbook.md](strategy-playbook.md) for research ideas, not as a
promise of returns. A market's resolution source is the arbiter: external data
is useful only when it predicts that exact source. Account for venue and
HiveTrade trading fees, liquidity, slippage, API failures, and correlation.
HiveTrade does not operate the venue or hold the bot's funds.

## Repository map

- `examples/bot-starter/bot.mjs` — runnable standalone runner and canonical helpers.
- `scripts/register-wallet.mjs` — signed wallet bootstrap.
- `test/bot-starter.test.mjs` — deterministic, no-network contract tests.
- `.env.example` — configuration template; `.env` is gitignored.
- `strategy-playbook.md` — category-oriented strategy research prompts.
