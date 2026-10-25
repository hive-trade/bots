// Fixture rule for the kit's own CLI tests. bot.mjs is pointed at this file
// instead of strategy.mjs, so replacing strategy.mjs with your own rule never
// breaks these tests. Not an example of a real rule.
export function strategy(market, env = process.env) {
  if (env.FIXTURE_DECISION === 'skip') return null;
  return { side: 'yes', maxPrice: 0.45 };
}
