// Educational example: buy the user-selected side only below their price cap.
// This is not a forecast or a profitable strategy. Replace this function with
// YOUR idea and data source. No side / price cap configured => always skip.
export function strategy(market, env = process.env) {
  const side = env.EXAMPLE_SIDE;
  if (!side && !env.EXAMPLE_MAX_PRICE) return null;
  if (!['yes', 'no'].includes(side)) throw new Error('EXAMPLE_SIDE must be yes or no');
  const maxPrice = Number(env.EXAMPLE_MAX_PRICE);
  if (!Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice >= 1) throw new Error('Price cap must be between 0 and 1');
  const ask = market[`${side}Ask`];
  if (!Number.isFinite(ask) || ask <= 0 || ask > maxPrice) return null;
  return { side, maxPrice };
}
