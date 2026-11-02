// Educational example: buy the user-selected side only at or below their price
// cap. This is not a forecast or a profitable strategy. Replace this function
// with YOUR rule and data source. No side / price cap configured => always skip.
//
// Contract: return null or { skip: true, reasons } to skip, or
// { side: "yes" | "no", maxPrice, reasons } to trade. maxPrice is the highest
// price the order may pay, inclusive (0.20 means up to and including 20 cents).
// reasons is optional: a list of short text lines the dry run prints as TRACE.
const usd = p => `$${p}`;
export function strategy(market, env = process.env) {
  const side = env.EXAMPLE_SIDE;
  if (!side && !env.EXAMPLE_MAX_PRICE) return { skip: true, reasons: ['example rule: EXAMPLE_SIDE and EXAMPLE_MAX_PRICE are empty, so it never trades'] };
  if (!['yes', 'no'].includes(side)) throw new Error('EXAMPLE_SIDE must be yes or no');
  const maxPrice = Number(env.EXAMPLE_MAX_PRICE);
  if (!Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice >= 1) throw new Error('Price cap must be between 0 and 1');
  const ask = market[`${side}Ask`];
  const name = side.toUpperCase();
  if (!Number.isFinite(ask) || ask <= 0) return { skip: true, reasons: [`example rule: no ${name} ask in the order book`] };
  if (ask > maxPrice) return { skip: true, reasons: [`example rule: ${name} costs ${usd(ask)}, above the ${usd(maxPrice)} cap`] };
  return { side, maxPrice, reasons: [`example rule: ${name} costs ${usd(ask)}, at or below the ${usd(maxPrice)} cap, so buy ${name}`] };
}
