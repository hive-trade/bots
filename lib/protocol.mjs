// Public wire protocol only. No HiveTrade strategy code.
import { SafeError } from './errors.mjs';
// Polymarket pm-op-v1: the bot signs the Call, HiveTrade places the Captain
// order in the Hive owner's own HiveTrade account. No order, no wallet, no fill.
export const PM_OP_EXECUTION = 'hivetrade-operator-v1';
// What this kit can sign, declared (inside the signed bytes) on the config read.
export const KIT_CAPABILITIES = ['pm-op-v1'];
export function signalMessage(s) {
  if (s.venue === 'kalshi') return [
    'HiveTrade bot signal kalshi-v2', `hive:${s.hiveId}`, 'venue:kalshi',
    `ticker:${s.kalshiTicker}`, `side:${s.side}`, `signal:${s.signalStrength}`,
    `stake:${s.stakeUsd}`, `contracts:${s.kalshiContracts}`, `priceCents:${s.kalshiPriceCents}`,
    'execution:hivetrade-v1', `nonce:${s.nonce}`, `issuedAt:${s.issuedAt}`, 'intent:true',
  ].join('\n');
  if (s.execution === PM_OP_EXECUTION) return [
    'HiveTrade bot signal pm-op-v1', `hive:${s.hiveId}`, 'venue:polymarket',
    `condition:${s.conditionId}`, `side:${s.side}`, `signal:${s.signalStrength}`,
    `stake:${s.stakeUsd}`, `limitPrice:${s.limitPrice}`, `execution:${PM_OP_EXECUTION}`,
    `nonce:${s.nonce}`, `issuedAt:${s.issuedAt}`, 'intent:true',
  ].join('\n');
  // LEGACY: older self-managed Polymarket bots only (POLYMARKET_LEGACY_SELF_MANAGED=true).
  return ['HiveTrade bot signal v1', `hive:${s.hiveId}`, `condition:${s.conditionId}`,
    `side:${s.side}`, `signal:${s.signalStrength}`, `stake:${s.stakeUsd}`,
    'order:marketable', `nonce:${s.nonce}`, `issuedAt:${s.issuedAt}`, 'intent:true',
  ].join('\n');
}
// The signed config read. With capabilities, the list is part of the signed bytes.
export function configMessage(issuedAt, capabilities = []) {
  return capabilities.length
    ? `hivetrade:bot-config:${issuedAt}:capabilities:${capabilities.join(',')}`
    : `hivetrade:bot-config:${issuedAt}`;
}
// A pm-op-v1 early exit: HiveTrade sells the Captain leg in the owner's account.
export function exitMessage(e) {
  return ['HiveTrade bot exit pm-op-v1', `hive:${e.hiveId}`, 'venue:polymarket',
    `condition:${e.conditionId.toLowerCase()}`, `side:${e.side}`, `execution:${PM_OP_EXECUTION}`,
    `nonce:${e.nonce}`, `issuedAt:${e.issuedAt}`].join('\n');
}
// A pm-op-v1 limit price: strictly between 0 and 1, at most 4 decimals.
export function isLimitPrice(p) {
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p >= 1) return false;
  return Math.abs(p * 1e4 - Math.round(p * 1e4)) < 1e-6;
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
  // The host and status are public facts; the path and query are not printed.
  if (!response.ok) throw new SafeError(`${new URL(url).host} answered HTTP ${response.status}.`);
  return response.json();
}

export async function registerWallet({ account, api, hiveId, walletAddress, request = jsonRequest }) {
  const registration = { hiveId, walletAddress, issuedAt: Date.now() };
  const signature = await account.signMessage({ message: walletMessage(registration) });
  return request(`${api}/api/admin/bot/register-wallet`, { ...registration, signature });
}

// Signed GET /api/bot/config: which mode the bot's Hive runs. It declares the
// kit's capabilities; a Hive moves to `operator` only after its bot declared
// pm-op-v1. Answers { hiveId, venue, pmCaptainExecution, signalVersion }.
export async function readBotConfig({ account, api, capabilities = KIT_CAPABILITIES, fetchImpl = fetch }) {
  const issuedAt = Date.now();
  const signature = await account.signMessage({ message: configMessage(issuedAt, capabilities) });
  const response = await fetchImpl(`${api}/api/bot/config`, {
    redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'x-bot-signature': signature, 'x-bot-issued-at': String(issuedAt),
      ...(capabilities.length ? { 'x-bot-capabilities': capabilities.join(',') } : {}) },
  });
  if (!response.ok) throw new SafeError(`${new URL(api).host} answered HTTP ${response.status} to the bot's mode check.`);
  return response.json();
}

// pm-op-v1 early exit, signed by the bot. The one-shot runner does not manage
// exits; this is here for bots that do.
export async function requestExit({ account, api, hiveId, conditionId, side, nonce, request = jsonRequest }) {
  const exit = { hiveId, conditionId, side, execution: PM_OP_EXECUTION, nonce, issuedAt: Date.now() };
  const signature = await account.signMessage({ message: exitMessage(exit) });
  return request(`${api}/api/bot/exit`, { request: exit, signature });
}
