import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { TOOLS, callTool } from '../mcp/tools.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const deps = { generatePrivateKey, privateKeyToAccount };
const SECRET = /0x[0-9a-fA-F]{64}/;

function kit(t, botSource = 'console.log("fixture")') {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-mcp-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(join(root, '.env.example'), join(dir, '.env.example'));
  writeFileSync(join(dir, 'bot.mjs'), botSource);
  return dir;
}
const text = result => result.content.map(c => c.text).join('\n');
const json = result => { assert.ok(!result.isError, text(result)); return JSON.parse(text(result)); };
const keyOf = dir => readFileSync(join(dir, '.env'), 'utf8').match(/BOT_PRIVATE_KEY=(.*)/)[1];
const fetchReturning = (status, body, calls = []) => async (url, options) => {
  calls.push({ url, options });
  return new Response(body === undefined ? 'not json' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};

test('the tool list has no way to post a Call, enable live trading, fund or touch credentials', () => {
  const names = TOOLS.map(t => t.name);
  assert.deepEqual(names, ['get_setup_status', 'create_signing_key', 'prepare_registration', 'check_registration', 'set_hive_id', 'get_bot_status', 'list_strategies', 'get_deploy_guide', 'dry_run']);
  for (const name of names) assert.doesNotMatch(name, /signal|live|fund|withdraw|credential|order|trade/);
});

test('create_signing_key returns only the public address, writes 0600 and never overwrites', async t => {
  const dir = kit(t);
  const created = await callTool('create_signing_key', {}, { dir, deps });
  assert.doesNotMatch(text(created), SECRET);
  const key = keyOf(dir);
  assert.match(key, /^0x[0-9a-f]{64}$/);
  assert.equal(json(created).signingAddress, privateKeyToAccount(key).address);
  assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
  const before = readFileSync(join(dir, '.env'), 'utf8');
  const again = await callTool('create_signing_key', {}, { dir, deps });
  assert.ok(again.isError); assert.match(text(again), /already exists/);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before);
});

test('create_signing_key refuses a folder that is not the kit', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'hivetrade-empty-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = await callTool('create_signing_key', {}, { dir, deps });
  assert.ok(result.isError); assert.ok(!existsSync(join(dir, '.env')));
});

test('get_setup_status reports progress and never includes the key', async t => {
  const dir = kit(t);
  assert.equal(json(await callTool('get_setup_status', {}, { dir, deps })).envFile, false);
  mkdirSync(join(dir, 'node_modules', 'viem'), { recursive: true });
  await callTool('create_signing_key', {}, { dir, deps });
  const key = keyOf(dir);
  writeFileSync(join(dir, '.env'), readFileSync(join(dir, '.env'), 'utf8')
    .replace('VENUE=kalshi', 'VENUE=polymarket').replace('POLYMARKET_DEPOSIT_WALLET=', `POLYMARKET_DEPOSIT_WALLET=0x${'ab'.repeat(20)}`));
  const result = await callTool('get_setup_status', {}, { dir, deps });
  assert.ok(!text(result).includes(key)); assert.doesNotMatch(text(result), SECRET);
  const status = json(result);
  assert.equal(status.signingAddress, privateKeyToAccount(key).address);
  assert.equal(status.venue, 'polymarket'); assert.equal(status.hiveId, null);
  assert.equal(status.polymarketDepositWallet, `0x${'ab'.repeat(20)}`);
  assert.equal(status.liveTradingEnabled, 'false'); assert.equal(status.envFilePrivate, true);
  assert.match(status.nextStep, /prepare_registration/);
});

test('prepare_registration builds the pre-filled link for the local signer and validates locally', async t => {
  const dir = kit(t);
  assert.ok((await callTool('prepare_registration', { name: 'Bot', venue: 'kalshi' }, { dir, deps })).isError); // no .env yet
  await callTool('create_signing_key', {}, { dir, deps });
  const address = privateKeyToAccount(keyOf(dir)).address;
  const out = json(await callTool('prepare_registration', { name: ' BTC & ETH bot ', bio: 'Buys 15-minute moves + more', category: 'crypto', venue: 'kalshi', maxStakeUsd: 5 }, { dir, deps }));
  const url = new URL(out.url);
  assert.equal(url.origin, 'https://app.hivetrade.com'); assert.equal(url.pathname, '/bots/new');
  assert.deepEqual(Object.fromEntries(url.searchParams), { name: 'BTC & ETH bot', bio: 'Buys 15-minute moves + more', category: 'Crypto', venue: 'kalshi', signer: address, maxStake: '5', from: 'agent' });
  assert.ok(!out.url.includes('+'), 'spaces are encoded as %20');
  assert.ok(out.instructions.some(line => line.includes(address)));
  assert.equal(new URL(json(await callTool('prepare_registration', { name: 'Dev bot', venue: 'polymarket', environment: 'dev' }, { dir, deps })).url).origin, 'https://dev.hivetrade.com');
  for (const bad of [{ name: 'ab', venue: 'kalshi' }, { name: 'x'.repeat(41), venue: 'kalshi' }, { name: 'Bot', bio: 'x'.repeat(501), venue: 'kalshi' },
    { name: 'Bot', venue: 'hyperliquid' }, { name: 'Bot', venue: 'kalshi', maxStakeUsd: 0 }, { name: 'Bot', venue: 'kalshi', maxStakeUsd: 101 },
    { name: 'Bot', venue: 'kalshi', category: 'Stocks' }, { name: 'Bot', venue: 'kalshi', environment: 'staging' }]) {
    assert.ok((await callTool('prepare_registration', bad, { dir, deps })).isError, JSON.stringify(bad));
  }
});

test('check_registration signs whoami and writes BOT_HIVE_ID, keeping other lines and 0600', async t => {
  const dir = kit(t);
  await callTool('create_signing_key', {}, { dir, deps });
  const key = keyOf(dir);
  const before = readFileSync(join(dir, '.env'), 'utf8').replace('BOT_API_URL=https://api.hivetrade.com', 'BOT_API_URL=https://api-dev.hivetrade.com');
  writeFileSync(join(dir, '.env'), before);
  const calls = [];
  const fetch = fetchReturning(200, { hiveId: 77, name: 'My bot', handle: 'my_bot', venue: 'polymarket' }, calls);
  const result = await callTool('check_registration', {}, { dir, deps, fetch, now: () => 1789480000000 });
  assert.doesNotMatch(text(result), SECRET);
  const out = json(result);
  assert.equal(out.hiveId, 77); assert.equal(out.environment, 'dev'); assert.deepEqual(out.replaced, ['VENUE was kalshi']);
  assert.equal(calls[0].url, 'https://api-dev.hivetrade.com/api/bot/whoami');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(Object.keys(body).sort(), ['issuedAt', 'signature']);
  assert.equal(body.issuedAt, 1789480000000);
  assert.equal(await recoverMessageAddress({ message: 'hivetrade:bot-whoami:1789480000000', signature: body.signature }), privateKeyToAccount(key).address);
  const after = readFileSync(join(dir, '.env'), 'utf8');
  assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
  const expected = before.replace('BOT_HIVE_ID=', 'BOT_HIVE_ID=77').replace('VENUE=kalshi', 'VENUE=polymarket');
  assert.equal(after, expected);
});

test('check_registration explains not-created, missing route and clock skew without writing', async t => {
  const dir = kit(t);
  await callTool('create_signing_key', {}, { dir, deps });
  const before = readFileSync(join(dir, '.env'), 'utf8');
  const notYet = json(await callTool('check_registration', {}, { dir, deps, fetch: fetchReturning(404, { error: 'No bot Hive', code: 'BOT_NOT_REGISTERED' }) }));
  assert.equal(notYet.registered, false); assert.match(notYet.message, /Not created yet/);
  const missing = json(await callTool('check_registration', {}, { dir, deps, fetch: fetchReturning(404, { error: 'Not found' }) }));
  assert.equal(missing.lookupUnavailable, true); assert.match(missing.message, /set_hive_id/);
  const skew = await callTool('check_registration', {}, { dir, deps, fetch: fetchReturning(401, { error: 'stale' }) });
  assert.ok(skew.isError); assert.match(text(skew), /clock/);
  const broken = await callTool('check_registration', {}, { dir, deps, fetch: fetchReturning(200, { hiveId: 'x' }) });
  assert.ok(broken.isError);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before);
});

test('set_hive_id writes only BOT_HIVE_ID and rejects junk', async t => {
  const dir = kit(t);
  await callTool('create_signing_key', {}, { dir, deps });
  const before = readFileSync(join(dir, '.env'), 'utf8');
  assert.equal(json(await callTool('set_hive_id', { hiveId: '12' }, { dir, deps })).hiveId, 12);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before.replace('BOT_HIVE_ID=', 'BOT_HIVE_ID=12'));
  for (const hiveId of ['1.5', '-3', 'abc', '12\nBOT_LIVE_TRADING_ENABLED=true', 0]) assert.ok((await callTool('set_hive_id', { hiveId }, { dir, deps })).isError);
  assert.match(readFileSync(join(dir, '.env'), 'utf8'), /^BOT_LIVE_TRADING_ENABLED=false$/m);
});

test('get_bot_status summarizes the public Hive defensively', async t => {
  const dir = kit(t);
  await callTool('create_signing_key', {}, { dir, deps });
  await callTool('set_hive_id', { hiveId: 9 }, { dir, deps });
  const calls = [];
  const hive = { id: 9, username: 'btc_bot', displayName: 'BTC bot', executionVenue: 'kalshi', isBot: true, memberCount: 3, resolvedCalls: 4,
    recentMarkets: [{ question: 'old', status: 'resolved', createdAt: '2026-06-01T00:00:00Z', influencerPosition: 'no' },
      { question: 'new', status: 'open', createdAt: '2026-07-01T00:00:00Z', influencerPosition: 'yes' }, null] };
  const out = json(await callTool('get_bot_status', {}, { dir, deps, fetch: fetchReturning(200, hive, calls) }));
  assert.equal(calls[0].url, 'https://api.hivetrade.com/api/hives/9'); assert.equal(calls[0].options.method, undefined);
  assert.equal(out.name, 'BTC bot'); assert.equal(out.memberCount, 3); assert.equal(out.venue, 'kalshi');
  assert.deepEqual(out.lastCall, { question: 'new', side: 'yes', status: 'open', createdAt: '2026-07-01T00:00:00Z' });
  const sparse = json(await callTool('get_bot_status', {}, { dir, deps, fetch: fetchReturning(200, {}) }));
  assert.equal(sparse.lastCall, null); assert.equal(sparse.memberCount, null);
  assert.equal(json(await callTool('get_bot_status', {}, { dir, deps, fetch: fetchReturning(404, { error: 'Hive not found' }) })).found, false);
});

test('dry_run forces live trading off, gives the run no key and hides key-like lines', async t => {
  const dir = kit(t, `
    console.log(JSON.stringify({ live: process.env.BOT_LIVE_TRADING_ENABLED, key: process.env.BOT_PRIVATE_KEY, options: process.env.NODE_OPTIONS ?? null, hive: process.env.BOT_HIVE_ID }));
    console.log('debug 0x' + 'cd'.repeat(32));
  `);
  await callTool('create_signing_key', {}, { dir, deps });
  writeFileSync(join(dir, '.env'), readFileSync(join(dir, '.env'), 'utf8').replace('BOT_LIVE_TRADING_ENABLED=false', 'BOT_LIVE_TRADING_ENABLED=true'));
  const result = await callTool('dry_run', {}, { dir, deps, env: { PATH: process.env.PATH, BOT_LIVE_TRADING_ENABLED: 'true', NODE_OPTIONS: '--no-warnings' } });
  assert.doesNotMatch(text(result), SECRET);
  const out = json(result);
  assert.equal(out.ok, true); assert.equal(out.liveTrading, false);
  const lines = out.stdout.split('\n');
  assert.deepEqual(JSON.parse(lines[0]), { live: 'false', key: '', options: null, hive: '1' });
  assert.match(lines[1], /line hidden/); assert.ok(out.placeholderHiveId);
  await callTool('set_hive_id', { hiveId: 42 }, { dir, deps });
  const registered = json(await callTool('dry_run', {}, { dir, deps, env: { PATH: process.env.PATH } }));
  assert.equal(JSON.parse(registered.stdout.split('\n')[0]).hive, '42'); assert.equal(registered.placeholderHiveId, undefined);
  assert.doesNotMatch(readFileSync(join(dir, '.env'), 'utf8'), /^BOT_LIVE_TRADING_ENABLED=false$/m, 'the .env flag the person set is left alone');
});

test('plugin manifests point at the MCP server and the marketplace', () => {
  const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(marketplace.name, 'hivetrade');
  assert.deepEqual(marketplace.plugins.map(p => [p.name, p.source]), [['hivetrade-bot', './']]);
  assert.equal(plugin.name, 'hivetrade-bot');
  assert.deepEqual(plugin.mcpServers['hivetrade-bot'].args, ['${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs']);
  assert.ok(existsSync(join(root, 'mcp/server.mjs')));
  assert.ok(existsSync(join(root, 'skills/hivetrade-bot/SKILL.md')));
});
