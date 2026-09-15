import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverMessageAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerWallet, walletMessage, signalMessage, fillMessage } from '../lib/protocol.mjs';
import { execute } from '../lib/run.mjs';
import { ClobClient, SignatureTypeV2 } from '@polymarket/clob-client-v2';
// Known unfunded fixture key, never submitted to a network.
const key = `0x${'01'.repeat(32)}`;
const account = privateKeyToAccount(key);
const signal = { hiveId: 7, venue: 'polymarket', conditionId: `0x${'ab'.repeat(32)}`,
  side: 'yes', signalStrength: 25, stakeUsd: 1, orderType: 'marketable', intent: true,
  nonce: 'test', issuedAt: 123 };
function cfg(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'public-signal-test-'));
  t.after(() => rmSync(stateDir, { recursive: true, force: true }));
  return { stateDir, hiveId: 7, api: 'https://api.hivetrade.com' };
}
test('both submitted phases authenticate the signer and omit secret material', async t => {
  const calls = [];
  await execute({ cfg: cfg(t), account, signal,
    request: async (url, body) => { calls.push({ url, body }); return calls.length === 1 ? { id: 41, go: true } : { ok: true }; },
    submitOrder: async () => ({ filled: true, orderID: 'order', filledUsd: 0.8, sizeShares: 2, avgPrice: 0.4 }),
  });
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls).includes(key.slice(2)), false);
  assert.equal(await recoverMessageAddress({ message: signalMessage(calls[0].body.signal), signature: calls[0].body.signature }), account.address);
  assert.equal(await recoverMessageAddress({ message: fillMessage(calls[1].body.fill), signature: calls[1].body.signature }), account.address);
});
test('wallet registration signs its address, hive and timestamp without transmitting the key', async () => {
  let sent;
  const walletAddress = `0x${'cd'.repeat(20)}`;
  await registerWallet({ account, api: 'https://api.hivetrade.com', hiveId: 7, walletAddress,
    request: async (url, body) => { sent = body; assert.equal(url, 'https://api.hivetrade.com/api/admin/bot/register-wallet'); return { ok: true }; },
  });
  assert.equal(JSON.stringify(sent).includes(key.slice(2)), false);
  assert.equal(await recoverMessageAddress({ message: walletMessage(sent), signature: sent.signature }), account.address);
  assert.notEqual(await recoverMessageAddress({ message: walletMessage({ ...sent, hiveId: 8 }), signature: sent.signature }), account.address);
});
test('server rejection never triggers the local captain order', async t => {
  await assert.rejects(execute({ cfg: cfg(t), account, signal,
    request: async () => { throw new Error('HTTP 409'); },
    submitOrder: async () => assert.fail('must not place a rejected trade'),
  }), /409/);
});
test('updated official SDK retains deposit-wallet signing and split order methods', () => {
  assert.equal(SignatureTypeV2.POLY_1271, 3);
  assert.equal(typeof ClobClient.prototype.createMarketOrder, 'function');
  assert.equal(typeof ClobClient.prototype.postOrder, 'function');
  const client = new ClobClient({ host: 'https://clob.polymarket.com', chain: 137, retryOnError: false });
  assert.equal(client.retryOnError, false);
});
