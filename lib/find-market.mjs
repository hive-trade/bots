// Turns a polymarket.com link (or a slug) into the exact market slug the
// runner needs, using Polymarket's public Gamma API. Read-only GET requests.
//
// Event vs market: an "event" page (polymarket.com/event/<event-slug>) can
// hold many Yes/No markets, each with its own slug. The runner trades exactly
// one market, so MARKET_SLUG must be a MARKET slug. Some event links already
// end in a market slug (polymarket.com/event/<event-slug>/<market-slug>), and
// some single-market pages use the market slug as the event part.
import { jsonRequest } from './protocol.mjs';
import { SafeError } from './errors.mjs';
const GAMMA = 'https://gamma-api.polymarket.com';
const SLUG = /^[a-z0-9-]+$/i;

export function parseMarketInput(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new SafeError('Give a polymarket.com link or a market slug.');
  if (!/^https?:\/\//i.test(text) && !text.includes('/')) {
    if (!SLUG.test(text)) throw new SafeError('That is not a Polymarket slug: use letters, digits and dashes, or paste the polymarket.com link.');
    return { candidates: [text], eventSlug: text };
  }
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new SafeError('That link could not be read. Paste the full polymarket.com link.'); }
  if (!['polymarket.com', 'www.polymarket.com'].includes(url.hostname)) throw new SafeError('Give a polymarket.com link.');
  const parts = url.pathname.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return ''; } });
  const at = parts.findIndex(part => part === 'event' || part === 'market');
  const [first, second] = at >= 0 ? parts.slice(at + 1, at + 3) : [];
  if (!first || !SLUG.test(first)) throw new SafeError('Use a polymarket.com/event/... or polymarket.com/market/... link.');
  const candidates = second && SLUG.test(second) ? [second, first] : [first];
  return { candidates, eventSlug: parts[at] === 'event' ? first : null };
}

const isOpen = m => m.active === true && m.closed !== true && m.acceptingOrders === true;
const summary = m => ({ slug: m.slug, question: m.question ?? null, open: isOpen(m),
  closed: m.closed === true, endDate: typeof m.endDate === 'string' ? m.endDate : null });

export async function findPolymarketMarket(input, { request = jsonRequest } = {}) {
  const { candidates, eventSlug } = parseMarketInput(input);
  for (const slug of candidates) {
    const markets = await request(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`);
    const market = Array.isArray(markets) ? markets.find(m => m?.slug === slug) : null;
    if (market) return { kind: 'market', ...summary(market), event: market.events?.[0]?.slug ?? null };
  }
  if (eventSlug) {
    const events = await request(`${GAMMA}/events?slug=${encodeURIComponent(eventSlug)}`);
    const event = Array.isArray(events) ? events.find(e => e?.slug === eventSlug) : null;
    if (event) {
      const markets = (Array.isArray(event.markets) ? event.markets : []).filter(m => m && typeof m.slug === 'string').map(summary);
      return { kind: 'event', event: event.slug, title: event.title ?? null, markets };
    }
  }
  throw new SafeError('No Polymarket market or event matches that link or slug.');
}
