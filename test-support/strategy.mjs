// Fixture rule for the kit's own CLI tests. bot.mjs is pointed at this file
// instead of strategy.mjs, so replacing strategy.mjs with your own rule never
// breaks these tests. Not an example of a real rule.
export function strategy(market, env = process.env) {
  if (env.FIXTURE_DECISION === 'skip') return { skip: true, reasons: ['fixture: told to skip'] };
  if (env.FIXTURE_DECISION === 'null') return null;
  if (env.FIXTURE_DECISION === 'throw') throw new Error('my data feed is empty');
  if (env.FIXTURE_DECISION === 'bad-reasons') return { side: 'yes', maxPrice: 0.45, reasons: 'not a list' };
  return { side: 'yes', maxPrice: 0.45, reasons: [`fixture: YES costs $${market.yesAsk}`, 'second line\nstays on one line'] };
}
