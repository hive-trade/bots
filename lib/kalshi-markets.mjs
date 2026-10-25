// The Kalshi series HiveTrade's bot API accepts, copied from the public list at
// https://docs.hivetrade.com/run-a-bot/kalshi ("Markets the bot API accepts") on
// 2026-10-25. The API decides: HiveTrade reviews and changes this list over time,
// and a ticker it refuses is rejected before any order is placed. A series is
// matched exactly (KXNFLGAME admits KXNFLGAME-..., not KXNFLGAMETD-...).
// This list says what the integration can execute, not what to trade.
export const KALSHI_BOT_SERIES = Object.freeze({
  'Crypto, 15-minute up/down': ['KXBTC15M', 'KXETH15M', 'KXSOL15M'],
  'Nasdaq-100, daily up/down': ['KXNASDAQDUD'],
  'Esports match winners': ['KXCS2GAME', 'KXLOLGAME', 'KXVALORANTGAME', 'KXDOTA2GAME', 'KXR6GAME', 'KXCODGAME', 'KXOWGAME', 'KXRLGAME'],
  'Soccer match results': ['KXEPLGAME', 'KXLALIGAGAME', 'KXSERIEAGAME', 'KXBUNDESLIGAGAME', 'KXLIGUE1GAME', 'KXUCLGAME', 'KXUELGAME', 'KXUECLGAME', 'KXEREDIVISIEGAME', 'KXLIGAPORTUGALGAME', 'KXEFLCHAMPIONSHIPGAME', 'KXSCOTTISHPREMGAME', 'KXBELGIANPLGAME', 'KXSUPERLIGGAME', 'KXCOPADELREYGAME', 'KXMLSGAME', 'KXLIGAMXGAME', 'KXARGPREMDIVGAME', 'KXDIMAYORGAME', 'KXCONMEBOLLIBGAME', 'KXCONMEBOLSUDGAME', 'KXSAUDIPLGAME', 'KXJLEAGUEGAME', 'KXFIFAWGAME'],
  'Other sports game, match and fight winners': ['KXNFLGAME', 'KXNCAAFGAME', 'KXCFLGAME', 'KXNBAGAME', 'KXWNBAGAME', 'KXEUROLEAGUEGAME', 'KXNBLGAME', 'KXNHLGAME', 'KXKHLGAME', 'KXMLBGAME', 'KXKBOGAME', 'KXNPBGAME', 'KXATPMATCH', 'KXWTAMATCH', 'KXATPCHALLENGERMATCH', 'KXWTACHALLENGERMATCH', 'KXUFCFIGHT', 'KXODIMATCH', 'KXT20MATCH', 'KXTESTMATCH'],
  'Elections and political events': ['KXHOUSERACE', 'KXSTATELEG', 'KXCAELECTION', 'KXSTATEBALLOTMEASURE', 'KXCAATTORNEYGENERAL', 'KXGOVAK', 'KXMISENATE', 'KXAKSENATE', 'KXIASENATE', 'KXMIDTERMHAPPEN', 'KXCHICAGOMAYOR', 'KXTORONTOMAYOR', 'KXVANCOUVERMAYOR', 'KXTAIPEIMAYOR', 'KXISRAELPM', 'KXBRPRES', 'KXFRENCHPRES', 'KXSPANISHPM', 'KXNEXTROMANIAPM', 'KXPRESNOMD', 'KXPRESNOMR', 'KXVPRESNOMD', 'KXVPRESNOMR', 'KXPRESPERSON', 'KXNOBELPEACE', 'KXUSAIRANAGREEMENT', 'KXIMPEACH', 'KXBILLS', 'KXELECTIONBILL', 'KXSCOTUSCASE', 'KXKASHOUT', 'KXALITOOUT', 'KXTRUMPADMINLEAVE', 'KXCABOUT', 'KXNEXTPRESSEC'],
  'Economics: central-bank decisions, inflation, jobs, growth': ['KXFEDDECISION', 'KXFED', 'KXRATEHIKE', 'KXCBDECISIONEU', 'KXCBDECISIONENGLAND', 'KXCBDECISIONCANADA', 'KXCBDECISIONJAPAN', 'KXCPI', 'KXCPIYOY', 'KXCPICORE', 'KXCPICOREYOY', 'KXPCECORE', 'KXU3', 'KXPAYROLLS', 'KXGDP', 'KXRECSSNBER', 'KXMORTGAGERATE'],
  'Entertainment awards and rankings': ['KXOSCARPIC', 'KXOSCARDIR', 'KXOSCARACTO', 'KXOSCARACTR', 'KXOSCARSUPACTO', 'KXOSCARSUPACTR', 'KXOSCARNOMPIC', 'KXCRITICSPIC', 'KXCRITICSDIR', 'KXCRITICSACTO', 'KXCRITICSACTR', 'KXCRITICSCHOICENOM', 'KXGGNOM', 'KXGRAMAOTY', 'KXGRAMBNA', 'KXGRAMMYNOMAOTY', 'KXGAMEAWARDS', 'KXTIME', 'KXSEXYMAN', 'KXDANCINGWITHTHESTARS', 'KXSUPERBOWLHEADLINE', 'KXBOND', 'KXTOPSONG', 'KXNETFLIXRANKMOVIE', 'KXNETFLIXRANKSHOW'],
  'Weather, daily US-city highs': ['KXHIGHNY', 'KXHIGHCHI', 'KXHIGHLAX', 'KXHIGHMIA', 'KXHIGHAUS', 'KXHIGHDEN', 'KXHIGHPHIL', 'KXHIGHTATL', 'KXHIGHTBOS', 'KXHIGHTDAL', 'KXHIGHTDC', 'KXHIGHTHOU', 'KXHIGHTLV', 'KXHIGHTMIN', 'KXHIGHTOKC', 'KXHIGHTPHX', 'KXHIGHTSATX', 'KXHIGHTSEA', 'KXHIGHTSFO'],
  'Weather, daily US-city lows': ['KXLOWTNYC', 'KXLOWTCHI', 'KXLOWTLAX', 'KXLOWTMIA', 'KXLOWTAUS', 'KXLOWTDEN', 'KXLOWTPHIL', 'KXLOWTATL', 'KXLOWTBOS', 'KXLOWTDAL', 'KXLOWTDC', 'KXLOWTLV', 'KXLOWTMIN', 'KXLOWTNOLA', 'KXLOWTOKC', 'KXLOWTPHX', 'KXLOWTSATX', 'KXLOWTSEA', 'KXLOWTSFO'],
  'Weather, daily rain': ['KXRAIN'],
  'Economics, weekly TSA checkpoint screenings': ['KXTSAW'],
  'Commodities, daily settle (gold, silver, natural gas, Brent, copper)': ['KXGOLDD', 'KXSILVERD', 'KXNATGASD', 'KXBRENTD', 'KXCOPPERD'],
  'Mention markets': ['KXTRUMPMENTION', 'KXTRUMPMENTIONB', 'KXTRUMPSAY', 'KXTRUMPSAYMONTH', 'KXTRUMPSAYCOMPANY', 'KXTRUMPSAYCOUNTRY', 'KXTRUMPSAYNICKNAME', 'KXVANCEMENTION', 'KXSECPRESSMENTION', 'KXFEDMENTION', 'KXDEBATEMENTION', 'KXBURNHAMMENTION'],
});
const ALL_SERIES = Object.values(KALSHI_BOT_SERIES).flat();
const TICKER = /^[A-Z0-9]+-[A-Z0-9.-]+$/;
export const isSupportedKalshiSeries = series => ALL_SERIES.includes(series);
export function kalshiSeriesOf(ticker) {
  if (typeof ticker !== 'string' || !TICKER.test(ticker)) return null;
  return ALL_SERIES.find(series => ticker.startsWith(`${series}-`)) ?? null;
}
export const isSupportedKalshiTicker = ticker => kalshiSeriesOf(ticker) !== null;

// KALSHI_SERIES mode: the market of that series that is open right now. A
// mechanical lookup that never reads prices. It picks a market only when
// exactly one is open (as with the 15-minute series); when several are open
// at once, the person must choose one, so it lists them and stops.
export function pickOpenMarket(markets, series, now = Date.now()) {
  if (!Array.isArray(markets)) throw new Error('Unexpected Kalshi market list');
  const open = markets.filter(m => typeof m?.ticker === 'string' && m.ticker.startsWith(`${series}-`)
    && m.status === 'active' && Date.parse(m.close_time) > now
    && (!m.open_time || Date.parse(m.open_time) <= now));
  if (open.length === 1) return { ticker: open[0].ticker };
  return { ticker: null, open: open.map(m => m.ticker) };
}
