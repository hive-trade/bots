import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { createIdentity } from '../lib/setup.mjs';
import { whoami } from '../scripts/whoami.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

function bot(t, patch = s => s) {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-whoami-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  createIdentity({ dir, template: readFileSync(join(root, '.env.example'), 'utf8'), generatePrivateKey, privateKeyToAccount });
  writeFileSync(join(dir, '.env'), patch(readFileSync(join(dir, '.env'), 'utf8')));
  return { dir, key: readFileSync(join(dir, '.env'), 'utf8').match(/BOT_PRIVATE_KEY=(.*)/)[1] };
}
const reply = (status, body, seen = []) => async (url, options) => { seen.push({ url, options }); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); };

test('npm run whoami signs the lookup, prints the Hive and checks BOT_HIVE_ID, never the key', async t => {
  const { dir, key } = bot(t, s => s.replace('BOT_API_URL=https://api.hivetrade.com', 'BOT_API_URL=https://api-dev.hivetrade.com'));
  const seen = [];
  const out = await whoami({ dir, privateKeyToAccount, fetch: reply(200, { hiveId: 4263, name: 'Bitcoin Dip Buyer', handle: 'btc_dip', venue: 'kalshi' }, seen), now: () => 1789480000000 });
  const text = out.lines.join('\n');
  assert.ok(out.ok); assert.ok(!text.includes(key.slice(2)));
  assert.equal(seen[0].url, 'https://api-dev.hivetrade.com/api/bot/whoami');
  const { signature } = JSON.parse(seen[0].options.body);
  assert.equal(await recoverMessageAddress({ message: 'hivetrade:bot-whoami:1789480000000', signature }), privateKeyToAccount(key).address);
  assert.match(text, /Hive 4263: Bitcoin Dip Buyer \(@btc_dip\), venue kalshi/);
  assert.match(text, /BOT_HIVE_ID in \.env: not set\. Save it with: npm run set-hive -- 4263/);
  const before = readFileSync(join(dir, '.env'), 'utf8');
  writeFileSync(join(dir, '.env'), before.replace('BOT_HIVE_ID=', 'BOT_HIVE_ID=4263'));
  assert.match((await whoami({ dir, privateKeyToAccount, fetch: reply(200, { hiveId: 4263, venue: 'kalshi' }) })).lines.join('\n'), /4263 \(matches\)/);
  writeFileSync(join(dir, '.env'), before.replace('BOT_HIVE_ID=', 'BOT_HIVE_ID=99'));
  assert.match((await whoami({ dir, privateKeyToAccount, fetch: reply(200, { hiveId: 4263, venue: 'kalshi' }) })).lines.join('\n'), /does NOT match/);
});
test('npm run whoami explains not-created, missing lookup and clock skew', async t => {
  const { dir } = bot(t);
  assert.match((await whoami({ dir, privateKeyToAccount, fetch: reply(404, { code: 'BOT_NOT_REGISTERED' }) })).lines.join('\n'), /No bot Hive on production/);
  assert.match((await whoami({ dir, privateKeyToAccount, fetch: reply(404, {}) })).lines.join('\n'), /npm run set-hive -- <ID>/);
  assert.match((await whoami({ dir, privateKeyToAccount, fetch: reply(401, {}) })).lines.join('\n'), /clock/);
});
