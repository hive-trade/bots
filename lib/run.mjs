import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { signalMessage, fillMessage } from './protocol.mjs';
export async function execute({ cfg, account, signal, submitOrder, request }) {
  mkdirSync(cfg.stateDir, { recursive: true, mode: 0o700 });
  const lock = join(cfg.stateDir, 'runner.lock');
  mkdirSync(lock); // Atomic single-process lock. A crash leaves it for manual review.
  try {
    const file = join(cfg.stateDir, 'journal.json');
    let records = [];
    try { records = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!Array.isArray(records)) throw new Error('Invalid journal');
    if (records.some(r => r.status !== 'complete')) throw new Error('Unresolved prior attempt; reconcile journal and venue before continuing');
    const key = `${cfg.api}:${cfg.hiveId}:${signal.venue}:${signal.conditionId ?? signal.kalshiTicker}`;
    if (records.some(r => r.key === key)) throw new Error('This market was already attempted; not submitting again');
    const record = { key, signal, status: 'submitting', startedAt: new Date().toISOString() };
    records.push(record);
    const save = () => { writeFileSync(`${file}.tmp`, JSON.stringify(records, null, 2), { mode: 0o600, flush: true }); renameSync(`${file}.tmp`, file); };
    save(); // Durable before the first request: never blindly repeat on timeout.
    const signature = await account.signMessage({ message: signalMessage(signal) });
    const reply = await request(`${cfg.api}/api/bot/signal`, { signal, signature });
    record.reply = reply; save();
    const marketId = reply.id ?? reply.marketId;
    if (!Number.isSafeInteger(marketId) || marketId <= 0) throw new Error('Unrecognized signal response; inspect journal');
    if (signal.venue === 'kalshi') {
      if (reply.accepted !== true || reply.venue !== 'kalshi') throw new Error('Kalshi v2 was not acknowledged; do not place a local order');
      // API owns execution. An accepted response is NOT a claim of a fill.
      if (reply.captainFill?.filled !== true) throw new Error('Kalshi accepted but fill unconfirmed; inspect Hive and venue');
      record.status = 'complete'; save();
      return { marketId, filled: true };
    }
    if (reply.go === false) { record.status = 'complete'; save(); return { marketId, skipped: true }; }
    if (reply.go !== true) throw new Error('Missing explicit go:true; no local order sent');
    record.status = 'placing-order'; save();
    const fillResult = await submitOrder();
    record.fillResult = fillResult; record.status = 'reporting-fill'; save();
    const fill = { hiveId: cfg.hiveId, marketId, fillResult, nonce: randomUUID(), issuedAt: Date.now() };
    const fillSignature = await account.signMessage({ message: fillMessage(fill) });
    record.fill = fill; save();
    await request(`${cfg.api}/api/bot/signal/${marketId}/fill`, { fill, signature: fillSignature });
    record.status = 'complete'; save();
    return { marketId, filled: true };
  } finally { rmdirSync(lock); }
}
