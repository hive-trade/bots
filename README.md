# Create your own HiveTrade bot — no code required

> **You don't need to know how to program.** You need an AI assistant
> (Claude, or any agent that can run commands for you) and ~10 minutes.
> Copy the message below, paste it to your assistant, answer its questions,
> and you'll have a live bot Hive that other people can copy-trade.

---

## 🚀 The kickoff message (copy-paste this to your AI assistant)

```
I want to create a trading bot on HiveTrade (a copy-trading platform for
Polymarket and Kalshi prediction markets). Please fetch and follow this guide exactly:

https://raw.githubusercontent.com/hive-trade/bots/main/README.md

Start by asking me the six setup questions in the guide, then do everything
else for me. My bot's key must be generated locally and never leave my machine.
```

That's it. Your assistant takes it from there. The rest of this document is
what your assistant will follow — you can read it, but you don't have to.

---

## For the AI assistant: the walkthrough

You are setting up a HiveTrade bot for a human who may not code. Be concise,
do the work, and ask only the six questions below. Everything happens on
their machine; the bot's private key NEVER leaves it and is never shown in
full to anyone — including HiveTrade.

### Step 0 — the six questions

1. **Venue** — Polymarket or Kalshi. A Bot Hive trades on one venue.
2. **Bot name** (3–40 chars; this becomes the public Hive name, e.g. "Nightowl · NBA Unders")
3. **What it bets on** (Polymarket supports all 8 categories. The public Kalshi
   starter currently covers verified BTC/ETH/SOL 15-minute directional markets.)
   For Polymarket, any niche works — all 8 categories, not just
   crypto: politics, finance, weather, sports, crypto, entertainment,
   technology, gaming. For where the edge and the data source are in each one,
   fetch + read the **strategy playbook** before answering Q4:
   https://raw.githubusercontent.com/hive-trade/bots/main/strategy-playbook.md)
4. **The strategy idea** in one sentence (you'll implement it in `strategy()`;
   if they have none, offer the conservative starter: "only near-coin-flip
   markets, skip everything else until we've watched it run")
5. **Stake per call** (Polymarket: recommend **$1** to start. Kalshi: the
   starter fixes size at one whole contract.)
6. **Where it runs** (their machine in a terminal window, or deployed —
   Railway/anything that runs Node 20+. Start local; deploy later.)

### Step 1 — generate the bot's identity (local key)

Requires Node 20+ (`node --version`; install from nodejs.org if missing).

```bash
mkdir my-hivetrade-bot && cd my-hivetrade-bot
npm init -y >/dev/null && npm install viem >/dev/null
node -e "const {generatePrivateKey, privateKeyToAccount} = require('viem/accounts');
const k = generatePrivateKey();
console.log('ADDRESS (public, share this):', privateKeyToAccount(k).address);
console.log('PRIVATE KEY (secret, save to .env, NEVER share):', k);"
```

Save the private key into a local `.env` file. Tell the human clearly:
**the ADDRESS is public and gets registered; the PRIVATE KEY stays here.**

### Step 2 — register the bot on HiveTrade

**No HiveTrade account yet? Doesn't matter.** Sign-in IS account creation:
one click with email or Google, ~30 seconds, no signup form, no email
verification. Existing account holders just sign in. Both cases follow the
exact same path:

- Open **hivetrade.co/bots/new** (it asks for sign-in if needed and brings
  them right back to the form)
- Paste the bot's **ADDRESS** from Step 1, choose the venue, and enter the bot
  name, category, and a bio
- They get back a **Hive ID** — ask them for it.

(Limits: 3 bots per account, one Hive per signer address.)

### Step 3 — the bot program

Download the starter for the chosen venue:

```bash
# Polymarket
curl -sO https://raw.githubusercontent.com/hive-trade/bots/main/examples/bot-starter/bot.mjs

# Kalshi
curl -sO https://raw.githubusercontent.com/hive-trade/bots/main/examples/kalshi-bot-starter/bot.mjs
```

For Kalshi, follow [`examples/kalshi-bot-starter/README.md`](./examples/kalshi-bot-starter/README.md).
The platform-auth EOA key signs HiveTrade messages. A separate trade-only
Kalshi RSA key stays in the bot process, and a second strictly read-only Kalshi
key is connected in HiveTrade Settings so the API can verify every venue fill
before member fanout. There is no wallet, relayer, gas, or RPC configuration.

Fill `.env`:

```
BOT_PRIVATE_KEY=0x…            # from Step 1
BOT_HIVE_ID=…                  # from Step 2
HIVETRADE_API=https://api-dev.hivetrade.co
MARKET_SLUG=…                  # the market(s) it watches — adapt findMarket() to the niche
STAKE_USD=1
```

Then implement THEIR strategy inside `strategy(market)` — it returns
`"yes"`, `"no"`, or `null` (skip). Keep their one-sentence idea recognizable
in the code; explain the rule back to them in plain words before going live.

**Don't default everyone to the 5-min crypto bot.** Match the implementation to
their category. Fetch the **strategy playbook**
(https://raw.githubusercontent.com/hive-trade/bots/main/strategy-playbook.md) —
it has a serious, concrete section for each of the 8 categories: what makes
money, the strategies, and the exact data source to pull (e.g. Open-Meteo
ensembles for weather, the-odds-api consensus for sports, GDELT news for
politics, CME FedWatch for rate markets). Pull that data source inside
`strategy()`, compute a fair probability, and bet only when it diverges from the
market price beyond fees. One rule decides whether they win money: **the data
source must match what the market RESOLVES on** (crypto settles on
Chainlink≈Binance, weather on a named NWS station, sports on the official final).

How a signal works (for your understanding — already implemented in the
starter): build a `BotSignal` `{hiveId, conditionId, side, signalStrength,
stakeUsd, orderType, nonce, issuedAt}`, sign the canonical v1 message with
EIP-191 `personal_sign`, POST `{signal, signature}` to `/api/bot/signal`.
HiveTrade recovers the signer, checks it against the registered address,
places the bot's own stake, and fans out to followers. Nonces are one-time;
signals expire after 2 minutes; a bot whose own leg doesn't fill creates
NO market (no fake track record — the bot needs real money at stake).

### Step 4 — prepare the venue account

**Polymarket:** the bot signer owns a separate self-managed deposit wallet.
Deploy and fund it, then bind it with the bot-signed registration request in
HiveTrade's developer guide. Do not reuse the human operator's wallet.

**Kalshi:** fund the Kalshi account used by the bot's local trade-only key. In
that same account, create a second key with exactly `read` scope and connect it
in HiveTrade Settings as the human bot operator. HiveTrade independently checks
the reported order through that verifier before member fanout; it rejects a
verifier with any write scope.

**Spending limits.** Every bot has two hard caps, set at registration and
editable anytime: a **per-call max stake** ($1 by default) and a **daily
budget** ($10 by default). A call above the per-call max is clamped down to
it, and a bot that hits its daily budget simply goes quiet until tomorrow
(UTC) — no error, no retry storm. One bad bot can never drain the wallet.

### Step 5 — run it & verify

```bash
node bot.mjs
```

Verify together: the console logs ticks; on its first fire, the call appears
on the bot's public Hive page (`hivetrade.co/hive/<id>`) within seconds.
Show the human their Hive page. They're live.

### Step 6 — design the clubhouse (logo, color, banner)

Every Hive is a room — make theirs feel like one. All of this is edited
live on their Hive page: **open `hivetrade.co/hive/<id>` while signed in →
"Edit page"** (top-right) → changes preview instantly → Save.

What they can customize:

| Field | What it does | Spec |
|---|---|---|
| **Avatar / logo** | The bot's face everywhere (cards, sidebar, page) | Square, ≥256×256 |
| **Accent color** | Soaks the whole page: tabs, buttons, atmosphere, avatar ring | Hex, e.g. `#f0b90b` |
| **Banner** | Full-width header image on the Hive page | Wide, ~1500×400 |
| **Background** | Subtle page wash behind the content | Large, low-contrast |
| **Rail logo** | Small brand mark (sidebar + banner watermark) | Square, simple |

**You (the assistant) should offer to design these.** Ask for a vibe in one
sentence ("retro terminal green", "Bitcoin orange, aggressive"), then:

1. **Pick the accent color first** — even with no images, the page builds an
   accent-gradient banner and tinted atmosphere from it automatically, so a
   single hex code already makes the room feel custom.
2. **Generate the logo + banner yourself** (SVG is easiest to write; export
   or keep as SVG). Keep the logo bold and simple; the banner can be a
   gradient in their accent + the bot's name + a motif.
3. **Host the images** so they have a URL. Easiest agent path: commit them to
   any public GitHub repo the human owns and use jsDelivr
   (`https://cdn.jsdelivr.net/gh/<user>/<repo>/logo.svg` — serves correct
   content types). Any image host works too.
4. Paste the URLs in Edit page, eyeball the live preview together, Save.

### Step 7 — keep it honest (read this to the human)

- Start at **$1 stakes** until the strategy proves itself over weeks, not days.
- The platform shows your real record — wins AND losses. A bot that stops
  being funded simply goes quiet; it cannot fake calls.
- You can pause anytime (stop the program). Followers can leave anytime.
- This is real money on real prediction markets. Nothing here is financial
  advice; never stake more than you can lose.

---

## Who owns and operates what

Your bot is **yours**: it runs on **your** machine (or a server you rent),
its key is generated locally and never leaves it, and the strategy — the
part that decides when and what to bet — is **your code and your decisions**.
The starter file is a template provided as-is; once you adapt it, it's your
derivative work. HiveTrade never runs your bot, never sees your key or your
strategy, and never makes trading decisions for you — it only verifies your
bot's signature and verifies the result against the Hive's selected venue.
Nothing here is financial advice.

## FAQ

**Does HiveTrade hold my bot's key or money?** The EIP-191 signing key and every
write-capable venue key stay on your machine. Polymarket bots use their own
deposit wallet. Kalshi bots use their own account and send HiveTrade only a
separate strictly read-only verifier key.

**What if my assistant isn't Claude?** Any agent that can fetch this page and
run terminal commands works — the kickoff message is agent-agnostic.

**Can I write the bot in Python/Go/anything?** Yes — the signal is a signed
string over HTTPS. Reproduce the canonical message (see `examples/bot-starter/
bot.mjs`) in any language with an EIP-191 signer.

**How do followers find my bot?** It's a normal Hive: Explore page, directory,
leaderboard once it has a track record.
