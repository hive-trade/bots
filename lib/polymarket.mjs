import axios from 'axios';
import { ClobClient, Chain, SignatureTypeV2, Side, OrderType } from '@polymarket/clob-client-v2';
import { createWalletClient, http, isAddress } from 'viem';
import { polygon } from 'viem/chains';
import { jsonRequest } from './protocol.mjs';
// The pinned SDK logs HTTP request headers on failure. Suppress its diagnostics
// around SDK calls so authentication headers never reach terminal/host logs.
async function sdkCall(fn) {
  const original = console.error;
  const timeout = axios.defaults.timeout;
  const redirects = axios.defaults.maxRedirects;
  axios.defaults.timeout = 30000;
  axios.defaults.maxRedirects = 0;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; axios.defaults.timeout = timeout; axios.defaults.maxRedirects = redirects; }
}
const HOST = 'https://clob.polymarket.com';
const array = value => typeof value === 'string' ? JSON.parse(value) : value;
export async function discoverPolymarket(slug) {
  if (!slug) throw new Error('Set MARKET_SLUG');
  const markets = await jsonRequest(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&closed=false`);
  const m = markets.find(m => m.slug === slug);
  if (!m || m.closed || m.active !== true || m.acceptingOrders !== true) throw new Error('Market is not accepting orders');
  const outcomes = array(m.outcomes);
  const tokens = array(m.clobTokenIds);
  if (outcomes?.length !== 2 || tokens?.length !== 2) throw new Error('Example requires a binary Yes/No market');
  const yes = outcomes.findIndex(x => x.toLowerCase() === 'yes');
  const no = outcomes.findIndex(x => x.toLowerCase() === 'no');
  if (yes < 0 || no < 0 || !/^0x[0-9a-fA-F]{64}$/.test(m.conditionId)) throw new Error('Unsupported market');
  const asks = await Promise.all([tokens[yes], tokens[no]].map(async token => {
    const book = await jsonRequest(`${HOST}/book?token_id=${encodeURIComponent(token)}`);
    const prices = (book.asks ?? []).filter(a => Number(a.size) > 0).map(a => Number(a.price)).filter(p => p > 0 && p < 1);
    return prices.length ? Math.min(...prices) : null;
  }));
  return { id: m.conditionId, conditionId: m.conditionId, question: m.question,
    yesToken: tokens[yes], noToken: tokens[no], yesAsk: asks[0], noAsk: asks[1], negRisk: m.negRisk === true };
}
export function interpretOrder(r, requestedUsd, makerWallet) {
  // Only an explicit immediate match with real quantities is a fill. An accepted
  // but delayed/live order, timeout or malformed response requires reconciliation.
  const usd = Number(r?.makingAmount), shares = Number(r?.takingAmount);
  if (r?.success !== false && !r?.error && !r?.errorMsg && r?.status === 'matched'
      && typeof r.orderID === 'string' && r.orderID && usd > 0 && shares > 0
      && Number.isFinite(usd) && Number.isFinite(shares) && usd / shares < 1
      && usd <= requestedUsd + 0.000001) {
    return { filled: true, orderID: r.orderID, status: r.status, filledUsd: usd,
      sizeShares: shares, avgPrice: usd / shares, requestedUsd, makerWallet };
  }
  // Conservative: even an error envelope might be ambiguous. Do not fabricate a
  // no-fill report. Halt and let the operator reconcile the actual venue receipt.
  throw new Error('Unconfirmed Polymarket outcome; reconcile state before continuing');
}
export async function preparePolymarket(account, cfg, market, decision, stake) {
  const funderAddress = process.env.POLYMARKET_DEPOSIT_WALLET;
  if (!isAddress(funderAddress ?? '') || funderAddress.toLowerCase() === account.address.toLowerCase()) throw new Error('Set the bot deposit wallet, not the signer address');
  const builder = await jsonRequest(`${cfg.api}/api/bot/builder-config`);
  if (!(builder.builderCode === null || /^0x[0-9a-fA-F]{64}$/.test(builder.builderCode))) throw new Error('Invalid builder configuration');
  const base = { host: HOST, chain: Chain.POLYGON, retryOnError: false,
    signer: createWalletClient({ account, chain: polygon, transport: http() }),
    funderAddress, signatureType: SignatureTypeV2.POLY_1271,
    ...(builder.builderCode ? { builderConfig: { builderCode: builder.builderCode } } : {}),
  };
  const temp = new ClobClient(base);
  let creds;
  try { creds = await sdkCall(() => temp.deriveApiKey()); } catch { /* New wallet may not have an API key yet. */ }
  if (!creds?.key || !creds?.secret || !creds?.passphrase) creds = await sdkCall(() => temp.createOrDeriveApiKey());
  if (!creds?.key || !creds?.secret || !creds?.passphrase) throw new Error('CLOB authentication failed');
  const client = new ClobClient({ ...base, creds });
  const tokenID = market[`${decision.side}Token`];
  const tickSize = await sdkCall(() => client.getTickSize(tokenID));
  const tick = Number(tickSize);
  if (!Number.isFinite(tick) || tick <= 0 || tick >= 1) throw new Error('Invalid tick size');
  const price = Number((Math.floor((decision.maxPrice + 1e-12) / tick) * tick).toFixed(6));
  if (price <= 0 || price > decision.maxPrice + 1e-10) throw new Error('Invalid tick-aligned price cap');
  // Construct the signed order BEFORE publishing an intent so configuration or
  // signing failures cannot leave followers with a Call the bot cannot execute.
  const order = await sdkCall(() => client.createMarketOrder({ tokenID, amount: stake, price,
    side: Side.BUY, orderType: OrderType.FAK }, { negRisk: market.negRisk, tickSize }));
  return async () => interpretOrder(await sdkCall(() => client.postOrder(order, OrderType.FAK)), stake, funderAddress);
}
