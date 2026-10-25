import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
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
  const address = privateKeyToAccount(secret).address;
  assert.equal(first.stdout, `Your bot's public address: ${address}\nGive this address to your agent. Your private key was saved in .env; never share it.\n`);
  assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
  const again = run();
  assert.notEqual(again.status, 0); assert.ok(!again.stderr.includes(secret) && !again.stdout.includes(secret));
  assert.match(again.stderr, new RegExp(`no new key was made[\\s\\S]*${address}`));
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
      else if (url.includes('/markets?series_ticker=KXBTC15M')) body = {markets:[{ticker:'KXBTC15M-OLD',status:'active',open_time:'2000-01-01T00:00:00Z',close_time:'2000-01-01T00:15:00Z'},{ticker:'KXBTC15M-EXAMPLE',status:'active',open_time:'2000-01-01T00:00:00Z',close_time:'2099-01-01T00:00:00Z'},{ticker:'KXBTC15M-NEXT',status:'active',open_time:'2098-12-31T23:45:00Z',close_time:'2099-01-01T00:15:00Z'}]};
      else if (url.includes('/markets?series_ticker=KXEPLGAME')) body = {markets:[{ticker:'KXEPLGAME-A-X',status:'active',close_time:'2099-01-01T00:00:00Z'},{ticker:'KXEPLGAME-B-Y',status:'active',close_time:'2099-01-02T00:00:00Z'}]};
      else if (url.includes('/markets/KXBTC15M-CLOSED')) body = {market:{ticker:'KXBTC15M-CLOSED',title:'BTC up?',status:'closed',close_time:'2026-10-25T12:00:00Z',yes_ask_dollars:'0.40',no_ask_dollars:'0.60'}};
      else if (url.includes('/markets/KXBTC15M-NOPE')) return new Response('{}', {status:404,headers:{'Content-Type':'application/json'}});
      else if (url.includes('/markets/KX')) body = {market:{ticker:url.split('/markets/')[1],title:'BTC up in 15 minutes?',status:'active',close_time:'2099-01-01T00:00:00Z',yes_ask_dollars:'0.40',no_ask_dollars:'0.60'}};
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
test('a stop names the setting to fix and mentions the journal only when there is one', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-errors-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cases = [
    [{ VENUE: '' }, /VENUE must be polymarket or kalshi/],
    [{ VENUE: 'polymarket', BOT_HIVE_ID: 'abc' }, /BOT_HIVE_ID must be a whole number/],
    [{ VENUE: 'polymarket', BOT_LIVE_TRADING_ENABLED: 'true' }, /BOT_HIVE_ID is not set\. Real trading needs it/],
    [{ VENUE: 'polymarket', MAX_STAKE_USD: '-1' }, /MAX_STAKE_USD must be a number above 0/],
    [{ VENUE: 'polymarket', MARKET_SLUG: '' }, /MARKET_SLUG is not set/],
    [{ VENUE: 'polymarket', MARKET_SLUG: 'https://polymarket.com/event/x' }, /MARKET_SLUG is a link, not a slug\. Run npm run find-market/],
    [{ VENUE: 'polymarket', STAKE_USD: '5' }, /stake \(\$5\) is above MAX_STAKE_USD \(\$1\)/],
    [{ VENUE: 'kalshi', KALSHI_TICKER: 'BTC' }, /KALSHI_TICKER must be an exact ticker/],
    [{ VENUE: 'polymarket', FIXTURE_DECISION: 'throw' }, /Your strategy threw an error: my data feed is empty/],
  ];
  for (const [env, message] of cases) {
    const result = runBot(dir, env);
    assert.notEqual(result.status, 0, JSON.stringify(env));
    assert.match(result.stderr, message, JSON.stringify(env));
    assert.doesNotMatch(result.stderr, /journal|reconcile/, 'no journal exists yet, so none is mentioned');
  }
  mkdirSync(join(dir, 'state')); writeFileSync(join(dir, 'state', 'journal.json'), '[]');
  assert.match(runBot(dir, { VENUE: '' }).stderr, /reconcile state\/journal\.json/);
});
test('Kalshi: any accepted series works, KALSHI_SERIES picks the open market, a closed one says so', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-kalshi-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const soccer = runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: 'KXEPLGAME-26OCT25ARSCHE-ARS', MAX_STAKE_USD: '1' });
  assert.equal(soccer.status, 0, soccer.stderr); assert.match(soccer.stdout, /"market":"KXEPLGAME-26OCT25ARSCHE-ARS"/);
  // One contract at a 45-cent cap: $0.45 + fee ceil(7 x 45 x 55 / 10000) cents = $0.47.
  assert.match(soccer.stdout, /^TRACE cost of one Call on Kalshi: at most \$0\.47 = 1 contract x \$0\.45 price cap \(\$0\.45\) \+ Kalshi fee up to \$0\.02$/m);
  const series = runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: '', KALSHI_SERIES: 'KXBTC15M' });
  assert.equal(series.status, 0, series.stderr);
  assert.match(series.stdout, /TRACE KALSHI_SERIES KXBTC15M: the market open right now is KXBTC15M-EXAMPLE/);
  assert.match(series.stdout, /"market":"KXBTC15M-EXAMPLE"/);
  const many = runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: '', KALSHI_SERIES: 'KXEPLGAME' });
  assert.notEqual(many.status, 0); assert.match(many.stderr, /2 KXEPLGAME markets are open at once, so the bot cannot pick one for you/);
  const closed = runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: 'KXBTC15M-CLOSED' });
  assert.notEqual(closed.status, 0);
  assert.match(closed.stderr, /The market in KALSHI_TICKER has closed \(it closed at 2026-10-25T12:00:00\.000Z\)\..*KALSHI_SERIES=KXBTC15M/);
  assert.match(runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: 'KXBTC15M-NOPE' }).stderr, /no market with the ticker/);
  assert.match(runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: 'KXNFLGAMETD-X' }).stderr, /series HiveTrade's bot API accepts/, 'series match is exact, not a prefix');
  assert.match(runBot(dir, { VENUE: 'kalshi', KALSHI_TICKER: '', KALSHI_SERIES: 'KXNOPE' }).stderr, /KALSHI_SERIES is not a series/);
  assert.match(runBot(dir, { VENUE: 'kalshi', KALSHI_SERIES: 'KXBTC15M' }).stderr, /not both/);
});
test('kit tests do not depend on the rule in strategy.mjs', t => {
  // A person replaces strategy.mjs with a rule that would never match the
  // fixture market. The CLI test above must still see the fixture decision.
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-own-rule-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = runBot(dir, { VENUE: 'polymarket', BOT_HIVE_ID: '42', EXAMPLE_SIDE: 'no', EXAMPLE_MAX_PRICE: '0.01' });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /"side":"yes"/);
});
test('npm run settings shows and changes public settings without ever printing the key', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-settings-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const node = args => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  assert.equal(node([join(root, 'scripts/setup.mjs')]).status, 0);
  const secret = readFileSync(join(dir, '.env'), 'utf8').match(/BOT_PRIVATE_KEY=(.+)/)[1];
  const shown = node([join(root, 'scripts/settings.mjs')]);
  assert.equal(shown.status, 0, shown.stderr); assert.ok(!shown.stdout.includes(secret.slice(2)));
  assert.match(shown.stdout, /^BOT_PRIVATE_KEY: set \(hidden\)$/m); assert.match(shown.stdout, /^BOT_LIVE_TRADING_ENABLED=false$/m);
  assert.equal(node([join(root, 'scripts/settings.mjs'), 'MARKET_SLUG=my-market']).status, 0);
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /^MARKET_SLUG=my-market$/m);
  assert.notEqual(node([join(root, 'scripts/settings.mjs'), 'BOT_LIVE_TRADING_ENABLED=true']).status, 0);
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /^BOT_LIVE_TRADING_ENABLED=false$/m);
});
test('npm run setup -- --dev points the bot at dev, so nobody edits .env by hand', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-setup-dev-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [join(root, 'scripts/setup.mjs'), '--dev'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Your bot's public address: 0x[0-9a-fA-F]{40}\nGive this address to your agent\. Your private key was saved in \.env; never share it\.\n$/);
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /^BOT_API_URL=https:\/\/api-dev\.hivetrade\.com$/m);
  const bad = spawnSync(process.execPath, [join(root, 'scripts/setup.mjs'), '--staging'], { cwd: mkdtempSync(join(tmpdir(), 'hivetrade-setup-bad-')), encoding: 'utf8' });
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /Usage/);
});
test('npm run set-hive saves only BOT_HIVE_ID and rejects junk', t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-hive-id-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const node = args => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  assert.notEqual(node([join(root, 'scripts/set-hive.mjs'), '42']).status, 0, 'no .env yet');
  assert.equal(node([join(root, 'scripts/setup.mjs')]).status, 0);
  const before = readFileSync(join(dir, '.env'), 'utf8');
  const saved = node([join(root, 'scripts/set-hive.mjs'), '4262']);
  assert.equal(saved.status, 0, saved.stderr); assert.equal(saved.stdout, 'Saved BOT_HIVE_ID=4262 in .env.\n');
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before.replace('BOT_HIVE_ID=', 'BOT_HIVE_ID=4262'));
  for (const bad of ['1.5', '-3', 'abc', '42\nBOT_LIVE_TRADING_ENABLED=true']) assert.notEqual(node([join(root, 'scripts/set-hive.mjs'), bad]).status, 0, bad);
});
