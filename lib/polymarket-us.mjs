// Polymarket US public market data, for pmus-v1 bots. Read-only GET requests
// on the public gateway: no key, no account, no order.
//
// The gateway answers HTTP 429 to bursts (about seven reads in a second), so
// every read here is ONE request at a time: never a Promise.all fan-out. A 429
// is retried twice, after a short pause.
//
// Prices: the venue's one instrument per market is the YES side, so every
// price the gateway returns is a YES price. The NO ask is 1 - the best YES bid.
// Never read a market's `outcomes` / `outcomePrices`: their order is not fixed.
import { jsonRequest, isLimitPrice } from './protocol.mjs';
import { SafeError } from './errors.mjs';
export const PMUS_GATEWAY = 'https://gateway.polymarket.us';
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
export const isPolymarketUsSlug = slug => typeof slug === 'string' && SLUG.test(slug);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isRateLimited = error => /HTTP 429\b/.test(String(error?.message));
const isNotFound = error => /HTTP 404\b/.test(String(error?.message));

// One gateway read. `request` and `wait` are injectable for tests.
export async function gatewayRead(path, { request = jsonRequest, wait = sleep, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await request(`${PMUS_GATEWAY}${path}`); }
    catch (error) {
      if (attempt >= retries || !isRateLimited(error)) throw error;
      await wait(1000 * (attempt + 1));
    }
  }
}

const round = n => Math.round(n * 1e6) / 1e6;
// `{ value: "0.5300", currency: "USD" }` -> 0.53; anything outside (0, 1) -> null.
function quote(raw) {
  const n = Number(raw?.value);
  return Number.isFinite(n) && n > 0 && n < 1 ? round(n) : null;
}
function levels(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(l => ({ price: quote(l?.px), quantity: Number(l?.qty) }))
    .filter(l => l.price !== null && Number.isFinite(l.quantity) && l.quantity > 0);
}
// A tick the venue can quote: 0.1 down to 0.0001, a whole number of ticks per dollar.
function supportedTick(raw) {
  const tick = Number(raw);
  if (!Number.isFinite(tick) || tick < 0.0001 - 1e-12 || tick > 0.1 + 1e-12) return null;
  return Math.abs(1 / tick - Math.round(1 / tick)) < 1e-6 ? tick : null;
}
const label = m => [m.question, m.title].filter(t => typeof t === 'string' && t.trim()).filter((t, i, all) => all.indexOf(t) === i).join(': ') || null;
const isOpenMarket = m => m?.active === true && m.closed !== true && (m.status == null || m.status === 'MARKET_STATUS_OPEN');

function checkSlug(slug) {
  if (!slug) throw new SafeError('MARKET_SLUG is not set. Set it to the exact Polymarket US market slug; npm run find-market -- <polymarket.us link> finds it.');
  if (/[/:]/.test(slug)) throw new SafeError('MARKET_SLUG is a link, not a slug. Run npm run find-market -- <that link> to get the market slug.');
  if (!isPolymarketUsSlug(slug)) throw new SafeError('MARKET_SLUG is not a Polymarket US market slug: lower-case letters, digits and dashes.');
}

// The market and its order book, read one after the other.
export async function discoverPolymarketUs(slug, opts = {}) {
  checkSlug(slug);
  const path = encodeURIComponent(slug);
  let m;
  try { ({ market: m } = await gatewayRead(`/v1/market/slug/${path}`, opts)); }
  catch (error) {
    if (isNotFound(error)) throw new SafeError('Polymarket US has no market with the slug in MARKET_SLUG. It may be an event\'s slug instead of a market\'s: npm run find-market -- <slug or link> lists the markets.');
    throw error;
  }
  if (m?.slug !== slug) throw new SafeError('Polymarket US returned an unexpected answer for this market slug.');
  if (!isOpenMarket(m)) throw new SafeError('MARKET_SLUG does not name an open Polymarket US market. The market may have closed.');
  const tickSize = supportedTick(m.orderPriceMinTickSize);
  if (tickSize === null) throw new SafeError('This Polymarket US market has a price step HiveTrade does not trade.');
  const { marketData: book } = await gatewayRead(`/v1/markets/${path}/book`, opts);
  if (book?.marketSlug !== slug) throw new SafeError('Polymarket US returned an unexpected order book for this market.');
  if (book.state != null && book.state !== 'MARKET_STATE_OPEN') throw new SafeError('This Polymarket US market is not open for orders right now.');
  const offers = levels(book.offers).map(l => l.price);
  const bids = levels(book.bids).map(l => l.price);
  return { id: slug, slug, question: label(m), tickSize,
    yesAsk: offers.length ? Math.min(...offers) : null,
    noAsk: bids.length ? round(1 - Math.max(...bids)) : null };
}

// The pmus-v1 limit price: your strategy's maxPrice rounded DOWN to the
// market's price step. HiveTrade never lets the Captain order, or any
// Member's copy, pay more per contract than this. A NO limit is a NO price.
export function pmusLimitPrice(market, decision) {
  const tick = market.tickSize;
  const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(tick) - 1e-9)));
  const price = Number((Math.floor((decision.maxPrice + 1e-12) / tick) * tick).toFixed(decimals));
  if (!isLimitPrice(price) || price > decision.maxPrice + 1e-10) throw new SafeError(`Your strategy's maxPrice (${decision.maxPrice}) is below this market's smallest price step (${tick}).`);
  return price;
}

// npm run find-market for Polymarket US: a polymarket.us link or a slug. A
// market slug answers with that market; an event slug lists its markets.
export function parsePolymarketUsInput(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new SafeError('Give a polymarket.us link or a market slug.');
  if (!/^https?:\/\//i.test(text) && !text.includes('/')) {
    if (!isPolymarketUsSlug(text)) throw new SafeError('That is not a Polymarket US slug: use lower-case letters, digits and dashes, or paste the polymarket.us link.');
    return { candidates: [text], eventSlug: text };
  }
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new SafeError('That link could not be read. Paste the full polymarket.us link.'); }
  if (!['polymarket.us', 'www.polymarket.us'].includes(url.hostname)) throw new SafeError('Give a polymarket.us link.');
  const parts = url.pathname.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return ''; } });
  const at = parts.findIndex(part => part === 'event' || part === 'market');
  const [first, second] = at >= 0 ? parts.slice(at + 1, at + 3) : [];
  if (!isPolymarketUsSlug(first)) throw new SafeError('Use a polymarket.us/event/... link.');
  return { candidates: isPolymarketUsSlug(second) ? [second, first] : [first], eventSlug: parts[at] === 'event' ? first : null };
}

const summary = m => ({ slug: m.slug, question: label(m), open: isOpenMarket(m),
  closed: m.closed === true, endDate: typeof m.endDate === 'string' ? m.endDate : null });

export async function findPolymarketUsMarket(input, opts = {}) {
  const { candidates, eventSlug } = parsePolymarketUsInput(input);
  for (const slug of candidates) {
    let body;
    try { body = await gatewayRead(`/v1/market/slug/${encodeURIComponent(slug)}`, opts); }
    catch (error) { if (isNotFound(error)) continue; throw error; }
    if (body?.market?.slug === slug) return { kind: 'market', venue: 'polymarket_us', ...summary(body.market) };
  }
  if (eventSlug) {
    let body;
    try { body = await gatewayRead(`/v1/events/slug/${encodeURIComponent(eventSlug)}`, opts); }
    catch (error) { if (!isNotFound(error)) throw error; }
    const event = body?.event;
    if (event?.slug === eventSlug) {
      const markets = (Array.isArray(event.markets) ? event.markets : []).filter(m => isPolymarketUsSlug(m?.slug)).map(summary);
      return { kind: 'event', venue: 'polymarket_us', event: event.slug, title: event.title ?? null, markets };
    }
  }
  throw new SafeError('No Polymarket US market or event matches that link or slug.');
}
