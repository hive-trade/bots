# Bot strategy playbook — every category, not just 5-minute crypto

The HiveTrade bot kit (the "create your own bot" guide / repo README) works for
**any** Polymarket market, not only BTC up-or-down. The crypto 5-minute bot is just the
easiest first example because the data is free, fast, and the markets fire every
five minutes. Every other category can be just as profitable — the edge is
different, the data source is different, and the cadence is slower, but the
shape of a winning bot is always the same.

This doc gives a serious, concrete starting point for each of the 8 categories:
**what the markets are, where the edge is, the strategies that make money, and
the exact data sources to pull.** Read the section for your niche, then
implement the rule inside `strategy(market)` in your `bot.mjs`.

---

## The universal shape of a profitable bot

Every category bot is the same four steps. Only the data source and the model
change.

```
strategy(market):
  1. FAIR   = your own probability the market resolves YES, from a data source
              the crowd underuses or reacts to slower than you
  2. PRICE  = the market's current YES price (≈ the crowd's probability)
  3. EDGE   = FAIR − PRICE   (for a YES bet; flip for NO)
  4. if EDGE > threshold (cover fees + slippage + your uncertainty):
        bet that side, size small
     else:
        return null   // no edge, no bet — skipping is a position
```

Four edges recur across every category. If you're not exploiting at least one,
you don't have a bot, you have a coin flip:

| Edge | What it is | Best categories |
|---|---|---|
| **Latency** | React to a real-world event before the market reprices | Sports, Gaming (live), Finance (data releases), Politics (breaking news) |
| **Better model** | A calibrated forecast the crowd doesn't compute | Weather, Crypto (short-window stats), Finance (macro) |
| **Favorite–longshot fade** | Cheap "will this wild thing happen" markets are systematically overpriced; fade them | Politics, Entertainment, Technology, Gaming |
| **Cross-source divergence** | The market disagrees with a sharper reference price | Sports (vs sportsbooks), Finance (vs CME FedWatch), Politics (vs poll models) |

### Two rules that decide whether you win money, not just predictions

1. **Match your data source to the RESOLUTION source.** A market is settled by
   a specific oracle, not by reality. Crypto up/down resolves on a Chainlink
   feed (≈ Binance close), so HiveTrade's own bots read Binance, not Kraken —
   Kraken disagreed ~10% of the time and the bot faded the wrong way. Weather
   resolves on a named station's official observation, not your forecast app.
   Sports resolves on the official final, not the live win-prob. **Always read
   the market's resolution criteria and pull the same source it settles on.**

2. **Beat the costs, not just the crowd.** Every fill pays the spread + a
   builder fee, and a copy-trade fills as a taker. A 1–2% theoretical edge is
   eaten alive. Demand a real margin (rule of thumb: only bet when your edge
   clears ~3–4 points) and prefer markets with a tight book.

---

## Crypto — the warm-up everyone starts with

**Markets:** "Bitcoin/Ethereum/Solana Up or Down" on 5-min, 15-min, 1-hour,
daily windows; "BTC above $X by date"; range markets.

**Where the edge is:** short-window statistics. Over thousands of 5-min/15-min
windows, price has weak but real structure — streaks mean-revert, multiple
momentum signals occasionally agree, and the market often opens near 50/50 even
after a run. The edge is small per trade and only shows up over volume +
selectivity.

**Strategies that work (these are the rules HiveTrade's own published bots run,
each validated on 18 months of data):**
- **Streak-fade** — after k same-direction candles, bet the reversal. Stronger
  on longer timeframes (1h > 15m > 5m).
- **Cross-confirm consensus** — only bet when two independent signal families
  (Bollinger/VWAP *and* a reversion/range/run-band consensus) agree on the same
  side; skip everything else. The selectivity is the edge.
- **Dip-catcher** — buy only the cheap side near a coin-flip (≤30¢) where the
  payout/odds are favorable.

**Data sources:** Binance / Coinbase / Kraken klines (free, no key) for OHLCV;
the Polymarket CLOB book for the live ask. Resolve on the **Chainlink-aligned**
ladder (Binance → Coinbase → Kraken) to match settlement.

**Reality check:** the per-trade edge is thin (~52–58% at best). This works
*because* it trades a lot. Don't expect it from a category that fires twice a
day.

---

## Weather — the most model-friendly category

**Markets:** "Will NYC high exceed X°F on <date>", "Will it rain in <city>
today", monthly temperature records, hurricane landfall, snowfall totals.

**Where the edge is:** weather is *forecastable* and the forecasts are public
and skillful. This is the category where "trust the calibrated model over the
crowd" is a genuine, repeatable edge — especially short-horizon (0–3 day), where
numerical forecasts are very accurate and the market is often slow or anchored
to a stale guess.

**Strategies:**
- **Forecast-vs-market.** Pull the official forecast for the resolution
  station, convert it to a probability the threshold is crossed, bet when the
  market diverges beyond your margin.
- **Ensemble exceedance.** Use an *ensemble* forecast (many model runs) directly
  as your fair probability of exceedance — e.g. 28 of 51 members clear 90°F →
  ~55% — and bet the gap. This is the cleanest "FAIR" you'll get in any category.
- **Nowcasting** for same-day rain: radar-based nowcasts beat the morning market
  by the afternoon.

**Data sources:** **Open-Meteo** (`open-meteo.com` — free, no key, global,
includes ensemble + probability + historical for backtests) is the go-to. Also
**NWS / api.weather.gov** (free, US, authoritative — and often the resolution
source for US weather markets), NOAA, Tomorrow.io, OpenWeatherMap.

**Match the resolution source:** US markets usually settle on a specific NWS/NOAA
station. Read which one, and pull that station — not a city-average app number.

---

## Sports — model the line, or beat the market on speed

**Markets:** game winners, spreads/totals as YES/NO, player props,
championships, "will team make playoffs." Live in-game markets are the prize.

**Where the edge is:** Polymarket's *pre-game* lines track sharp sportsbooks
closely — hard to beat cold. Two real edges:
- **Live latency arb.** During a game, win probability jumps on every score. If
  the PM market lags a fast live feed by even seconds, buy the side that just
  got better before it reprices. This is the single best sports-bot edge.
- **Cross-book divergence.** Compare PM's implied probability to the *vig-free
  consensus* of many sportsbooks. When PM is off the sharp line by more than the
  fee, bet toward the consensus.

**Strategies:**
- Pull a live win-probability or a consensus pre-game line → compare to PM
  `yesPrice` → bet the underpriced side beyond a threshold.
- Player-prop / unders models from box-score trends (pace, minutes, matchup).
- Fade retail-darling favorites in primetime games (public overbets popular teams).

**Data sources:** **the-odds-api.com** (consensus odds across many books — the
fastest path to a "fair" line), **API-Football / API-Sports**, **SportsRadar**
(paid, fast live), **balldontlie** (free NBA), **ESPN's hidden JSON endpoints**
(`site.api.espn.com/...`) for live scores/state. For live arb, the feed's
latency is your whole edge — pay for a fast one.

---

## Politics — react to news, or fade the longshots

**Markets:** elections, primaries, "will <bill> pass", appointments, Fed/policy
decisions (overlaps Finance), geopolitical events, "will <leader> still be in
office by date."

**Where the edge is:**
- **News reaction.** Political markets reprice on developments — a poll, a
  resignation, a ruling. A bot wired to a news/event feed can detect a
  market-moving headline and bet before the slower crowd moves.
- **Poll/model divergence.** Compare the market to a poll aggregate or a
  structured model; bet the gap on the liquid headline races.
- **Favorite–longshot fade.** Cheap "will this dramatic thing happen by date"
  markets are systematically overpriced (people overpay for lottery tickets).
  Systematically *selling/fading* longshots near resolution is a classic, durable
  edge.

**Strategies:**
- Keyword/event detector on a news feed → map headline → market → bet the
  repricing direction within your latency window.
- Calendar bot: known dated events (FOMC, election day, scheduled rulings) —
  pre-position with a model and a base rate.

**Data sources:** **GDELT** (free, global news-event database, near-real-time),
**NewsAPI.org**, Reuters/AP **RSS**, the **X/Twitter API** (fast but noisy),
poll aggregates (538 / Silver Bulletin CSVs, RealClearPolitics), legislative data
(**ProPublica Congress API**, GovTrack). Beware: many political markets are
illiquid and slow — your edge is reaction speed or longshot-fade, not volume.

---

## Finance — macro releases, index moves, and rate markets

**Markets:** "S&P/index Up or Down today", "will SPX close above X", earnings
beats, CPI/jobs prints, Fed rate decisions, "will <stock> hit $Y."

**Where the edge is:**
- **Data-release latency.** CPI, NFP, FOMC drop at a known second. The market
  reprices instantly, but a bot reading the official release (or a fast vendor)
  can react in the seconds of chaos.
- **CME FedWatch arb.** Fed-decision markets should match CME-implied
  probabilities; when PM diverges from FedWatch, bet toward it.
- **Index short-windows.** "Index up/down today" behaves like crypto but only
  during market hours — momentum/mean-reversion on a live index feed.
- **Post-earnings drift / estimate revisions** for "will company beat."

**Strategies:**
- Macro-calendar bot: at release time, read the print vs consensus, bet the
  direction the market under/over-reacts.
- FedWatch-divergence bot for rate markets.

**Data sources:** **FRED** (free, official US econ data + release calendar),
**Trading Economics** / econ calendars, **CME FedWatch**, market data via
**Alpha Vantage / Finnhub / Polygon.io / Yahoo Finance**, earnings calendars
(**Finnhub**). Handle market-hours/session timing — equities don't move
overnight.

---

## Technology — calendars, shipping slips, and trackable milestones

**Markets:** product launches, "will <company> ship <feature> by date", AI model
releases, "will <model> top <benchmark>", tech IPOs, "will <repo> hit X stars",
"will <company> announce Z at <event>."

**Where the edge is:**
- **Ship-date fade.** Companies miss self-imposed deadlines far more than the
  market prices. "Will X ship by <date>" is usually overpriced YES — fading it
  as the date nears is a durable base-rate edge.
- **Trackable milestones.** "Will repo hit X stars / model top a leaderboard"
  resolves on a number you can poll directly — extrapolate the trend, bet when
  the market hasn't caught up.
- **Event calendars.** WWDC, Google I/O, earnings — position with informed priors.

**Strategies:**
- Milestone-tracker bot: poll the real metric (stars, downloads, benchmark
  rank), project the resolution, bet the gap.
- Deadline-fade bot: as a ship-by date approaches with no signal of release,
  lean NO.

**Data sources:** **GitHub API** (stars/releases), **HuggingFace API**
(model downloads/trending), **LMArena / benchmark leaderboards**, company IR /
event calendars, tech RSS (The Verge, official blogs).

---

## Entertainment — precursors and pre-sales beat pundits

**Markets:** award shows (Oscars/Grammys/Emmys), box-office ("will <film> gross
$X opening weekend"), chart positions, reality-TV outcomes, viral/cultural events.

**Where the edge is:** domain data the casual crowd ignores.
- **Awards: precursor signals.** Guild awards (SAG, DGA, PGA) and critics'
  prizes predict the Oscars strongly. A model built on precursors beats market
  vibes — especially before the buzz catches up.
- **Box office: pre-sales + tracking.** Fandango pre-sales and tracking data
  forecast opening weekend well; bet the over/under threshold on the gap.
- **Charts: streaming data.** Spotify/Luminate numbers front-run "will song hit
  #1."

**Strategies:**
- Awards bot seeded from precursor results + a consensus aggregator.
- Box-office bot from pre-sales vs the market's threshold.

**Data sources:** **GoldDerby** (awards consensus), **Box Office Mojo / The
Numbers**, **Spotify charts**, **TMDb**, social-trend data. Lower-liquidity,
event-driven — this is a "be right a few times a month with real domain data"
category, not a high-frequency one.

---

## Gaming — esports speed, release slips, trackable records

**Markets:** esports match/tournament winners, "will <game> release by date",
speedrun records, Twitch viewership milestones, player/team props.

**Where the edge is:**
- **Esports live + pre-match** — exactly like sports: model from team ratings,
  or arb the live feed on map/round outcomes (latency edge).
- **Release-date fade** — games slip even more than tech; fade optimistic
  "ships by date" YES.
- **Trackable records** — speedrun leaderboards and viewer counts resolve on
  pollable numbers.

**Strategies:**
- Esports model/live-arb bot from an esports data API.
- Release-deadline fade bot.
- Record-tracker bot (speedrun.com / Twitch concurrent viewers).

**Data sources:** **PandaScore** (esports odds + live data API), **HLTV /
Liquipedia** (CS/Dota ratings + schedules), **speedrun.com API**, **Twitch API**
(viewership), **SteamDB** (release/player data).

---

## Picking your category — match strategy to cadence

| Category | Cadence | Primary edge | Hardest part |
|---|---|---|---|
| Crypto | seconds–minutes | short-window stats, volume | thin per-trade edge |
| Weather | daily | calibrated forecast | matching the exact station |
| Sports | per-game / live | live latency, vs-sportsbook | fast feed costs money |
| Finance | releases / daily | data-release latency, FedWatch | market-hours timing |
| Politics | event-driven | news reaction, longshot-fade | illiquidity |
| Technology | weeks | ship-date fade, milestones | sparse markets |
| Entertainment | weekly–seasonal | precursors, pre-sales | low liquidity |
| Gaming | per-match / event | esports live, release fade | data fragmentation |

**Start where your data is fast and free** (crypto, weather), prove the loop end
to end at $1 stakes, then move to a category where you have a real informational
or speed advantage. The kit doesn't care which category you pick — `strategy()`
returns `"yes"`, `"no"`, or `null`, and HiveTrade executes it the same way for
all eight.

> Nothing here is financial advice. Prediction markets are real-money and risky;
> never stake more than you can lose, and start small until a strategy proves
> itself over weeks, not days.
