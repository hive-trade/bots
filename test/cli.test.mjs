import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('setup writes secret locally, prints only address and never overwrites existing .env', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-setup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, [join(root, 'scripts/setup.mjs')], { cwd: dir, encoding: 'utf8' });
  const first = run(); assert.equal(first.status, 0, first.stderr);
  const contents = readFileSync(join(dir, '.env'), 'utf8');
  const secret = contents.match(/BOT_PRIVATE_KEY=(.+)/)[1];
  assert.match(secret, /^0x[0-9a-f]{64}$/);
  assert.ok(!first.stdout.includes(secret)); assert.ok(!first.stderr.includes(secret));
  assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
  assert.notEqual(run().status, 0);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), contents);
});
test('both CLI dry runs use only public GET requests and need no private key', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-dry-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fixture = join(dir, 'fixture.mjs');
  writeFileSync(fixture, `
    globalThis.fetch = async (url, options = {}) => {
      if (options.method && options.method !== 'GET') throw new Error('WRITE REQUEST FORBIDDEN');
      let body;
      if (url.includes('builder-config')) body = { kalshiApiBase: 'https://api.elections.kalshi.com/trade-api/v2' };
      else if (url.includes('/markets/KX')) body = {market:{ticker:'KXBTC15M-EXAMPLE',status:'active',close_time:'2099-01-01T00:00:00Z',yes_ask_dollars:'0.40',no_ask_dollars:'0.60'}};
      else if (url.includes('gamma-api')) body = [{slug:'example',active:true,acceptingOrders:true,conditionId:'0x'+'ab'.repeat(32),outcomes:'["No","Yes"]',clobTokenIds:'["2","1"]',negRisk:false}];
      else if (url.includes('/book?')) body = { asks:[{price:'0.40',size:'3'}] };
      else throw new Error('Unexpected URL');
      return new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json'}});
    };
  `);
  for (const venue of ['polymarket', 'kalshi']) {
    const result = spawnSync(process.execPath, ['--import', fixture, join(root, 'bot.mjs')], { cwd: dir, encoding: 'utf8', env: {
      PATH: process.env.PATH, VENUE: venue, BOT_HIVE_ID: '42', BOT_LIVE_TRADING_ENABLED: 'false',
      EXAMPLE_SIDE: 'yes', EXAMPLE_MAX_PRICE: '0.45', MARKET_SLUG: 'example', KALSHI_TICKER: 'KXBTC15M-EXAMPLE',
    } });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /DRY RUN/);
    assert.equal(result.stderr, '');
  }
});
