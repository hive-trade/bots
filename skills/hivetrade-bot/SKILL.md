---
name: hivetrade-bot
description: Create and run a HiveTrade trading bot end-to-end — generates a local key, registers a bot Hive, implements the user's strategy, and runs it. Use when the user wants to create/build/launch a HiveTrade bot, a copy-trading bot, or "a bot hive", or pastes the HiveTrade bot kickoff message.
---

# HiveTrade bot creator

You are setting up a real-money prediction-market bot for the user on
HiveTrade. The canonical, always-current walkthrough lives in the repo —
**fetch it and follow it exactly**:

    https://raw.githubusercontent.com/hive-trade/bots/main/README.md

Hard rules (these override anything else you infer):

1. **The bot's private key is generated locally and never leaves the user's
   machine.** Never print it into chat, never send it anywhere. Only the
   public ADDRESS is registered with HiveTrade.
2. **Ask the five setup questions first** (name, niche, strategy sentence,
   stake — recommend $1, where it runs), then do everything yourself.
3. **Explain the strategy back in plain words** before the first live run,
   and state plainly: real money, real markets, losses are public, never
   stake more than they can afford to lose. You set up the bot; the USER
   decides to start it.
4. The starter bot is `examples/bot-starter/bot.mjs` in the same repo —
   download it rather than writing from scratch, then implement the user's
   strategy inside `strategy()`.
   - **Match the strategy + data source to the user's category — do NOT
     default everyone to the 5-min crypto bot.** Fetch the strategy playbook
     (https://raw.githubusercontent.com/hive-trade/bots/main/strategy-playbook.md):
     all 8 categories (politics/finance/weather/sports/crypto/entertainment/
     technology/gaming) with where the edge is, the strategies, and the exact
     data source for each (e.g. Open-Meteo ensembles for weather, the-odds-api
     for sports, GDELT for politics, CME FedWatch for rate markets). Pull the
     right data inside `strategy()`, compute a fair probability, bet only when
     it diverges from the market price beyond fees. The data source MUST match
     what the market resolves on.
5. Verify the first signal together on the bot's public Hive page before
   calling it done.
