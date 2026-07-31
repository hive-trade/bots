# Create your own HiveTrade bot — no code required

> **You don't need to know how to program.** You need an AI assistant
> (Claude, or any agent that can run commands for you) and ~10 minutes.
> Copy the message below, paste it to your assistant, answer its questions,
> and you'll have a live bot Hive that other people can copy-trade.

---

## 🚀 The kickoff message (copy-paste this to your AI assistant)

```
I want to create a trading bot on HiveTrade (a copy-trading platform for
Polymarket prediction markets). Please fetch and follow this guide exactly:

https://raw.githubusercontent.com/hive-trade/bots/main/README.md

Start by asking me the five setup questions in the guide, then do everything
else for me. My bot's key must be generated locally and never be shown in
chat or sent to anyone.
```

That's it. Your assistant takes it from there. The rest of this document is
what your assistant will follow — you can read it, but you don't have to.

---

## For the AI assistant: the walkthrough

You are setting up a HiveTrade bot for a human who may not code. Be concise,
do the work, and ask only the five questions below. Everything happens on
their machine. The bot's private key is NEVER shown in chat, never sent to
HiveTrade, and never handled by you — the human is the only one who moves it,
and only ever into their own `.env` or their own hosting account's secret
settings.

### Step 0 — the five questions

1. **Bot name** (3–40 chars; this becomes the public Hive name, e.g. "Nightowl · NBA Unders")
2. **What it bets on** (any Polymarket niche — all 8 categories work, not just
   crypto: politics, finance, weather, sports, crypto, entertainment,
   technology, gaming. For where the edge and the data source are in each one,
   fetch + read the **strategy playbook** before answering Q3:
   https://raw.githubusercontent.com/hive-trade/bots/main/strategy-playbook.md)
3. **The strategy idea** in one sentence (you'll implement it in `strategy()`;
   if they have none, offer the conservative starter: "only near-coin-flip
   markets, skip everything else until we've watched it run")
4. **Stake per call** (the bot's own money each bet — recommend **$1** to start)
5. **Where it runs** — offer both, and say what each costs:
   - **Their computer** — free, running in a terminal window. Perfect for
     testing. **The bot stops the moment they close the laptop or it sleeps.**
   - **A always-on server** — a few dollars a month, runs 24/7 even when
     their computer is off. This is what a live bot wants.

   Recommend: **test on their computer first, then deploy before going live.**
   Step 5 covers both. Don't skip the deploy conversation — a bot that only
   trades while a laptop is open will miss most of its markets.

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
- Paste the bot's **ADDRESS** from Step 1, the bot name, category, and a bio
- They get back a **Hive ID** — ask them for it.

(Limits: 3 bots per account, one Hive per signer address.)

### Step 3 — the bot program

Download the starter (or write it — it's one file):

```bash
curl -sO https://raw.githubusercontent.com/hive-trade/bots/main/examples/bot-starter/bot.mjs
```

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

### Step 4 — fund the bot

The bot bets real money on every call (that's the point — followers copy
real risk). **The bot's stakes are paid from the owner's own HiveTrade
deposit wallet** — the one on their Portfolio page. Two cases:

- **Brand-new account**: the Portfolio page shows **"Set up wallet to
  deposit"** — a one-minute guided setup that creates their personal
  Polymarket deposit wallet (gasless, they own it). Do this first.
- **Existing account with a wallet**: skip straight to Deposit.

Then: hivetrade.co → Portfolio → **Deposit** (USDC on Polygon; a few dollars
is plenty at $1 stakes). No separate bot wallet to set up — and without
funds the bot simply stays silent (it cannot fire unfunded calls).

**Spending limits.** Every bot has two hard caps, set at registration and
editable anytime: a **per-call max stake** ($1 by default) and a **daily
budget** ($10 by default). A call above the per-call max is clamped down to
it, and a bot that hits its daily budget simply goes quiet until tomorrow
(UTC) — no error, no retry storm. One bad bot can never drain the wallet.

### Step 5a — run it locally & verify

```bash
npm install
npm start
```

Verify together: the console logs ticks; on its first fire, the call appears
on the bot's public Hive page (`hivetrade.co/hive/<id>`) within seconds.
Show the human their Hive page.

**This is a test run, not the finish line.** Say so plainly: the bot is alive
only while this terminal window is open and the computer is awake. Close the
lid and it stops trading mid-market.

### Step 5b — deploy it so it runs 24/7 (recommended before going live)

A trading bot that sleeps when its owner sleeps misses most of its markets.
Once the local run looks right, move it to an always-on server.

**The requirement is generic:** anything that runs a Node 20+ worker process
continuously. Railway, Fly.io, Render, a cheap VPS, even a Raspberry Pi left
on at home. This repo ships `package.json` + `railway.json`, so it deploys
as-is on any Nixpacks-based host.

**Recommended: Railway.** Fastest path from zero, and it redeploys
automatically when the code changes.

1. **Get the code into their own GitHub repo.** Easiest: open
   <https://github.com/hive-trade/bots> → **Use this template** → creates
   their own copy. (Or `git init` their local folder and push it.) Their
   strategy edits then live in their repo.
2. **Create the service.** On [railway.app](https://railway.app): *New Project
   → Deploy from GitHub repo* → pick their repo. Railway detects Node and runs
   `npm start`.
3. **Set the environment variables** (Railway → *Variables*). Everything from
   `.env.example`: `BOT_HIVE_ID`, `HIVETRADE_API`, `MARKET_SLUG`, `STAKE_USD`,
   `POLL_SECONDS` — and `BOT_PRIVATE_KEY`.

   > ⚠️ **The human sets `BOT_PRIVATE_KEY` themselves, in the Railway
   > dashboard.** Do NOT ask them to paste their private key into the chat,
   > and do not set it for them via the CLI. Every other variable is fine for
   > you to handle. Stop here, tell them exactly which field to fill, and wait.

4. **Confirm it's alive.** Railway → *Deployments → Logs* should show the same
   tick lines as the local run. Then re-check the Hive page.

**Cost, say it out loud:** running locally is free. An always-on server is
typically **a few dollars a month** — Railway's free allowance will not keep a
24/7 worker up indefinitely. A user who doesn't know this will think their bot
is running when it has quietly stopped.

**Turning it off:** pause or delete the Railway service. The Hive goes quiet;
nothing else happens.

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
its key is generated locally and only ever goes to machines you control —
your computer, or your own hosting account. HiveTrade never receives it. The
strategy — the
part that decides when and what to bet — is **your code and your decisions**.
The starter file is a template provided as-is; once you adapt it, it's your
derivative work. HiveTrade never runs your bot, never sees your key or your
strategy, and never makes trading decisions for you — it only verifies your
bot's signature and executes the signed instruction from your own deposit
wallet, exactly like it does when a human captain fires a call. Nothing here
is financial advice.

## FAQ

**Does HiveTrade hold my bot's key or money?** No. The bot's signing key lives
wherever you run the bot — your own computer, or your own hosting account —
and HiveTrade never receives it. Stakes are paid from your own Polymarket deposit wallet —
HiveTrade can sign trades from it (that's how copy-trading works) but can
never move your money out; only you can withdraw.

**What if my assistant isn't Claude?** Any agent that can fetch this page and
run terminal commands works — the kickoff message is agent-agnostic.

**Can I write the bot in Python/Go/anything?** Yes — the signal is a signed
string over HTTPS. Reproduce the canonical message (see `examples/bot-starter/
bot.mjs`) in any language with an EIP-191 signer.

**How do followers find my bot?** It's a normal Hive: Explore page, directory,
leaderboard once it has a track record.
