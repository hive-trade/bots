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
// The kit's CLI tests run bot.mjs with test-support/strategy.mjs in place of
// strategy.mjs, so they pass whatever rule the person writes.
const useFixtureStrategy = join(root, 'test-support/use-fixture-strategy.mjs');
function publicFetchFixture(dir) {
  const fixture = join(dir, 'fixture.mjs');
  writeFileSync(fixture, `
    globalThis.fetch = async (url, options = {}) => {
      if (options.method && options.method !== 'GET') throw new Error('WRITE REQUEST FORBIDDEN');
      let body;
      if (url.includes('builder-config')) body = { kalshiApiBase: 'https://api.elections.kalshi.com/trade-api/v2' };
      else if (url.includes('/markets/KX')) body = {market:{ticker:'KXBTC15M-EXAMPLE',title:'BTC up in 15 minutes?',status:'active',close_time:'2099-01-01T00:00:00Z',yes_ask_dollars:'0.40',no_ask_dollars:'0.60'}};
      else if (url.includes('gamma-api')) body = [{slug:'example',question:'Example market?',active:true,acceptingOrders:true,conditionId:'0x'+'ab'.repeat(32),outcomes:'["No","Yes"]',clobTokenIds:'["2","1"]',negRisk:false}];
      else if (url.includes('/book?')) body = { asks:[{price:'0.40',size:'3'}] };
      else throw new Error('Unexpected URL');
      return new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json'}});
    };
  `);
  return fixture;
}
function runBot(dir, env) {
  return spawnSync(process.execPath, ['--import', useFixtureStrategy, '--import', publicFetchFixture(dir), join(root, 'bot.mjs')], { cwd: dir, encoding: 'utf8', env: {
    PATH: process.env.PATH, BOT_LIVE_TRADING_ENABLED: 'false', MARKET_SLUG: 'example', KALSHI_TICKER: 'KXBTC15M-EXAMPLE', ...env,
  } });
}
test('both CLI dry runs use only public GET requests and need no private key', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-dry-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const venue of ['polymarket', 'kalshi']) {
    const result = runBot(dir, { VENUE: venue, BOT_HIVE_ID: '42' });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /DRY RUN/);
    assert.equal(result.stderr, '');
    const skip = runBot(dir, { VENUE: venue, BOT_HIVE_ID: '42', FIXTURE_DECISION: 'skip' });
    assert.equal(skip.status, 0, skip.stderr); assert.match(skip.stdout, /^SKIP: /m); assert.doesNotMatch(skip.stdout, /DRY RUN/);
  }
});
test('the dry run prints a decision trace: market inputs, then the rule\'s own reasons', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-trace-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const trade = runBot(dir, { VENUE: 'polymarket' });
  assert.equal(trade.status, 0, trade.stderr);
  const lines = trade.stdout.trim().split('\n');
  assert.ok(lines.includes('TRACE market 0x' + 'ab'.repeat(32) + ': Example market?'), trade.stdout);
  assert.ok(lines.includes('TRACE asks: YES $0.40, NO $0.40'), trade.stdout);
  assert.ok(lines.includes('TRACE fixture: YES costs $0.4'));
  assert.ok(lines.includes('TRACE second line stays on one line'), 'a reason never spans lines');
  assert.match(lines.at(-1), /"mode":"DRY RUN"/);
  const skip = runBot(dir, { VENUE: 'kalshi', FIXTURE_DECISION: 'skip' });
  assert.match(skip.stdout, /^TRACE fixture: told to skip\nSKIP: your rule did not select a trade\.$/m);
  assert.doesNotMatch(skip.stdout, /example rule/);
  const plainNull = runBot(dir, { VENUE: 'kalshi', FIXTURE_DECISION: 'null' });
  assert.equal(plainNull.status, 0, plainNull.stderr); assert.match(plainNull.stdout, /^SKIP: your rule did not select a trade\.$/m);
  const bad = runBot(dir, { VENUE: 'kalshi', FIXTURE_DECISION: 'bad-reasons' });
  assert.notEqual(bad.status, 0); assert.doesNotMatch(bad.stdout, /DRY RUN/);
});
test('a dry run works before the Hive exists; live trading without a Hive ID stops', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-no-hive-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dry = runBot(dir, { VENUE: 'polymarket' });
  assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /DRY RUN/); assert.match(dry.stdout, /BOT_HIVE_ID is not set yet/);
  const live = runBot(dir, { VENUE: 'polymarket', BOT_LIVE_TRADING_ENABLED: 'true' });
  assert.notEqual(live.status, 0); assert.doesNotMatch(live.stdout, /DRY RUN|LIVE/);
});
test('npm run dry-run forces live trading off and drops the key, whatever .env says', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-dry-run-script-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const probe = join(dir, 'probe.mjs');
  // Stand-in for bot.mjs: report what the run would see.
  writeFileSync(probe, `import { registerHooks } from 'node:module';
    registerHooks({ resolve(s, c, next) { if (s === '../bot.mjs') return { url: 'data:text/javascript,console.log(JSON.stringify({live:process.env.BOT_LIVE_TRADING_ENABLED,key:process.env.BOT_PRIVATE_KEY}))', shortCircuit: true }; return next(s, c); } });`);
  const result = spawnSync(process.execPath, ['--import', probe, join(root, 'scripts/dry-run.mjs')], { cwd: dir, encoding: 'utf8',
    env: { PATH: process.env.PATH, BOT_LIVE_TRADING_ENABLED: 'true', BOT_PRIVATE_KEY: '0x' + '01'.repeat(32) } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { live: 'false', key: '' });
});
test('kit tests do not depend on the rule in strategy.mjs', t => {
  // A person replaces strategy.mjs with a rule that would never match the
  // fixture market. The CLI test above must still see the fixture decision.
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-own-rule-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = runBot(dir, { VENUE: 'polymarket', BOT_HIVE_ID: '42', EXAMPLE_SIDE: 'no', EXAMPLE_MAX_PRICE: '0.01' });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /"side":"yes"/);
});
