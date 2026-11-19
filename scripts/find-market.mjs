// npm run find-market -- <polymarket.com or polymarket.us link, or slug> [--us]
// Prints the exact MARKET_SLUG for a link. Public read-only requests; no key.
// A polymarket.us link is looked up on Polymarket US; so is a bare slug with
// --us (or VENUE=polymarket_us in the environment). Otherwise Polymarket.
import { findMarket } from '../lib/find-market.mjs';
import { stopMessage } from '../lib/errors.mjs';
try {
  const args = process.argv.slice(2);
  const us = args.includes('--us');
  const input = args.filter(a => a !== '--us').join(' ');
  if (!input) throw Object.assign(new Error(), { usage: true });
  const found = await findMarket(input, { venue: us ? 'polymarket_us' : process.env.VENUE });
  const exchange = found.venue === 'polymarket_us' ? 'Polymarket US' : 'Polymarket';
  if (found.kind === 'market') {
    console.log(`Market: ${found.question ?? found.slug}`);
    console.log(`MARKET_SLUG=${found.slug}`);
    console.log(`Status: ${found.open ? 'open, accepting orders' : found.closed ? 'closed' : 'not accepting orders right now'}`);
    if (found.endDate) console.log(`${exchange} end date: ${found.endDate}`);
  } else {
    const open = found.markets.filter(m => m.open);
    console.log(`This link is an event${found.title ? ` (${found.title})` : ''} with ${found.markets.length} markets. Each market has its own slug.`);
    console.log('Pick the one market your rule trades and set MARKET_SLUG to its slug:');
    for (const m of open) console.log(`  ${m.slug}  ${m.question ?? ''}`);
    const hidden = found.markets.length - open.length;
    if (hidden > 0) console.log(`(${hidden} closed or paused market${hidden > 1 ? 's' : ''} not shown)`);
  }
} catch (error) {
  if (error.usage) console.error('Usage: npm run find-market -- <polymarket.com or polymarket.us link, or market slug> (add --us for a Polymarket US slug)');
  else console.error(stopMessage('market lookup', error));
  process.exitCode = 1;
}
