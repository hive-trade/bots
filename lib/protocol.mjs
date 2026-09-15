// Public wire protocol only. No HiveTrade strategy code.
export function signalMessage(s) {
  if (s.venue === 'kalshi') return [
    'HiveTrade bot signal kalshi-v2', `hive:${s.hiveId}`, 'venue:kalshi',
    `ticker:${s.kalshiTicker}`, `side:${s.side}`, `signal:${s.signalStrength}`,
    `stake:${s.stakeUsd}`, `contracts:${s.kalshiContracts}`, `priceCents:${s.kalshiPriceCents}`,
    'execution:hivetrade-v1', `nonce:${s.nonce}`, `issuedAt:${s.issuedAt}`, 'intent:true',
  ].join('\n');
  return ['HiveTrade bot signal v1', `hive:${s.hiveId}`, `condition:${s.conditionId}`,
    `side:${s.side}`, `signal:${s.signalStrength}`, `stake:${s.stakeUsd}`,
    'order:marketable', `nonce:${s.nonce}`, `issuedAt:${s.issuedAt}`, 'intent:true',
  ].join('\n');
}
export function fillMessage(f) {
  const r = f.fillResult;
  const num = n => typeof n === 'number' && Number.isFinite(n) ? String(n) : '';
  return ['HiveTrade bot fill v1', `hive:${f.hiveId}`, `market:${f.marketId}`,
    `filled:${r.filled ? 'true' : 'false'}`, `order:${r.orderID ?? ''}`,
    `filledUsd:${num(r.filledUsd)}`, `shares:${num(r.sizeShares)}`,
    `nonce:${f.nonce}`, `issuedAt:${f.issuedAt}`].join('\n');
}
export function walletMessage({ hiveId, walletAddress, issuedAt }) {
  return `hivetrade:bot-register-wallet:${hiveId}:${walletAddress.toLowerCase()}:${issuedAt}`;
}
export function kalshiStake(contracts, cents) {
  return (contracts * cents + Math.ceil(7 * contracts * cents * (100 - cents) / 10000)) / 100;
}
export async function jsonRequest(url, payload) {
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(30000),
    ...(payload === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
  });
  // Do not log raw response bodies: gateways and SDKs can include credentials.
  if (!response.ok) throw new Error(`Request failed: HTTP ${response.status}`);
  return response.json();
}
