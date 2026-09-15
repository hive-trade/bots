---
name: hivetrade-bot
description: Set up the standalone public HiveTrade Polymarket bot starter, including local key generation, deposit-wallet registration, mock verification, strategy implementation, and an explicitly user-authorized live start.
---

# HiveTrade Polymarket bot setup

Use the repository README as the canonical walkthrough:

    https://raw.githubusercontent.com/hive-trade/bots/main/README.md

Follow these rules:

1. Generate the signing key locally. Never print the private key into chat,
   include it in a request, commit it, or disclose it to HiveTrade. Only its
   address is public.
2. Ask the five setup questions in the README before implementation.
3. Clone the repository, use `npm ci`, copy `.env.example` to `.env`, and run
   `npm test`. Do not rewrite the signing helpers.
4. Use the bot's own official Polymarket `POLY_1271` deposit wallet. Confirm its
   owner is the signer, register it with `npm run register-wallet`, and fund the
   deposit wallet rather than the signer EOA.
5. Match the strategy and data source to the market's stated resolution source.
   Keep `strategy()` returning `null` until the rule is reviewed and tested.
6. Explain the strategy, risks, fees, and stake in plain language. Real money is
   involved, losses are public, and the user decides whether to start the funded
   runner. Never perform the first live start without that explicit decision.
7. Verify the first authorized signal, captain fill, and public Hive record
   together. Stop the process if the fill or record does not reconcile.
8. Do not adapt this Polymarket starter for Kalshi. Use the linked Kalshi guide,
   whose execution and credential contract is different.
