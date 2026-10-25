// npm run find-market -- <polymarket.com link or slug>
// Prints the exact MARKET_SLUG for a link. Public read-only requests; no key.
import { findPolymarketMarket } from '../lib/find-market.mjs';
import { stopMessage } from '../lib/errors.mjs';
try {
  const input = process.argv.slice(2).join(' ');
  if (!input) throw Object.assign(new Error(), { usage: true });
  const found = await findPolymarketMarket(input);
  if (found.kind === 'market') {
    console.log(`Market: ${found.question ?? found.slug}`);
    console.log(`MARKET_SLUG=${found.slug}`);
    console.log(`Status: ${found.open ? 'open, accepting orders' : found.closed ? 'closed' : 'not accepting orders right now'}`);
    if (found.endDate) console.log(`Polymarket end date: ${found.endDate}`);
  } else {
    const open = found.markets.filter(m => m.open);
    console.log(`This link is an event${found.title ? ` (${found.title})` : ''} with ${found.markets.length} markets. Each market has its own slug.`);
    console.log('Pick the one market your rule trades and set MARKET_SLUG to its slug:');
    for (const m of open) console.log(`  ${m.slug}  ${m.question ?? ''}`);
    const hidden = found.markets.length - open.length;
    if (hidden > 0) console.log(`(${hidden} closed or paused market${hidden > 1 ? 's' : ''} not shown)`);
  }
} catch (error) {
  if (error.usage) console.error('Usage: npm run find-market -- <polymarket.com link or market slug>');
  else console.error(stopMessage('market lookup', error));
  process.exitCode = 1;
}
