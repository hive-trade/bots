import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketInput, findPolymarketMarket } from '../lib/find-market.mjs';
import { callTool } from '../mcp/tools.mjs';

const market = (slug, extra = {}) => ({ slug, question: `${slug}?`, active: true, closed: false, acceptingOrders: true, endDate: '2099-01-01T00:00:00Z', ...extra });
function gamma({ markets = {}, events = {} }) {
  const seen = [];
  const request = async url => {
    seen.push(url);
    const { pathname, searchParams } = new URL(url);
    assert.equal(new URL(url).host, 'gamma-api.polymarket.com');
    const slug = searchParams.get('slug');
    if (pathname === '/markets') return markets[slug] ? [markets[slug]] : [];
    if (pathname === '/events') return events[slug] ? [events[slug]] : [];
    throw new Error('unexpected');
  };
  return { request, seen };
}

test('links and slugs become market-slug candidates; other hosts are refused', () => {
  assert.deepEqual(parseMarketInput('https://polymarket.com/event/big-event'), { candidates: ['big-event'], eventSlug: 'big-event' });
  assert.deepEqual(parseMarketInput('https://www.polymarket.com/event/big-event/one-market?tid=1'), { candidates: ['one-market', 'big-event'], eventSlug: 'big-event' });
  assert.deepEqual(parseMarketInput('polymarket.com/market/one-market'), { candidates: ['one-market'], eventSlug: null });
  assert.deepEqual(parseMarketInput('one-market'), { candidates: ['one-market'], eventSlug: 'one-market' });
  for (const bad of ['', 'https://evil.example/event/x', 'https://polymarket.com/', 'not a slug!']) assert.throws(() => parseMarketInput(bad), bad);
});

test('an event link that is really a market slug resolves to that market', async () => {
  // The 2026-10-25 test: polymarket.com/event/will-kylian-mbapp-win-the-2026-ballon-dor was a market slug.
  const { request } = gamma({ markets: { 'will-x-win': market('will-x-win', { events: [{ slug: 'x-winner' }] }) } });
  const found = await findPolymarketMarket('https://polymarket.com/event/will-x-win', { request });
  assert.deepEqual(found, { kind: 'market', slug: 'will-x-win', question: 'will-x-win?', open: true, closed: false, endDate: '2099-01-01T00:00:00Z', event: 'x-winner' });
});

test('an event with many markets lists them in Polymarket\'s order, unranked', async () => {
  const { request } = gamma({ events: { 'x-winner': { slug: 'x-winner', title: 'X winner', markets: [market('b'), market('a', { closed: true }), market('c')] } } });
  const found = await findPolymarketMarket('https://polymarket.com/event/x-winner', { request });
  assert.equal(found.kind, 'event');
  assert.deepEqual(found.markets.map(m => [m.slug, m.open]), [['b', true], ['a', false], ['c', true]]);
});

test('nothing found is a plain message; the MCP tool uses the same lookup', async () => {
  const { request } = gamma({});
  await assert.rejects(findPolymarketMarket('nothing-here', { request }), /No Polymarket market or event matches/);
  const tool = await callTool('find_market', { link: 'https://polymarket.com/event/nothing-here' }, { dir: '.', request });
  assert.ok(tool.isError); assert.match(tool.content[0].text, /No Polymarket market/);
});
