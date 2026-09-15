import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validate, inspectTarget, stage, verifyLogs, run } from '../scripts/railway.mjs';
const id = '00000000-0000-4000-8000-000000000001';
const deploymentId = '00000000-0000-4000-8000-000000000002';
const input = { project: id, environment: id, service: id, intervalMinutes: 15, variables: { VENUE: 'polymarket', BOT_HIVE_ID: '1', MARKET_SLUG: 'example-market' } };
const status = (service = {}, volumes = []) => ({ id, environments: { edges: [{ node: { id, canAccess: true, serviceInstances: { edges: [{ node: { serviceId: id, ...service } }] }, volumeInstances: { edges: volumes.map(node => ({ node })) } } }] } });
test('offline plan makes no CLI calls; rejects secrets and ambiguous destinations', () => {
  assert.equal(run('plan', input, undefined, () => assert.fail()).mode, 'dry-run only');
  for (const key of ['BOT_PRIVATE_KEY', 'RAILWAY_TOKEN', 'BOT_LIVE_TRADING_ENABLED', 'STATE_DIR']) assert.throws(() => validate({ ...input, variables: { ...input.variables, [key]: 'secret' } }));
  assert.throws(() => validate({ ...input, service: 'friendly-name' }));
  assert.throws(() => validate({ ...input, intervalMinutes: 1 }));
  assert.throws(() => validate({ ...input, variables: { ...input.variables, MARKET_SLUG: 'bad\nvalue' } }));
});
test('existing deployments, linked sources, wrong targets and conflicting volumes fail closed', () => {
  assert.equal(inspectTarget(status(), input), false);
  assert.equal(inspectTarget(status({}, [{ serviceId: id, mountPath: '/data' }]), input), true);
  for (const s of [{ latestDeployment: { id } }, { source: { repo: 'someone/repo' } }, { source: { image: 'image' } }]) assert.throws(() => inspectTarget(status(s), input));
  assert.throws(() => inspectTarget({ ...status(), id: deploymentId }, input));
  for (const volume of [{ mountPath: '/other' }, { mountPath: '/data', isPendingDeletion: true }]) assert.throws(() => inspectTarget(status({}, [{ serviceId: id, ...volume }]), input));
});
test('staging excludes secrets and state; generates single-replica cron; rejects symlinks', () => {
  const source = mkdtempSync(join(tmpdir(), 'bot-source-'));
  const dest = mkdtempSync(join(tmpdir(), 'bot-dest-'));
  try {
    mkdirSync(join(source, 'lib')); mkdirSync(join(source, 'scripts'));
    for (const f of ['bot.mjs', 'strategy.mjs', 'package.json', 'package-lock.json', 'scripts/railway-job.mjs', 'lib/test.mjs', '.env', 'lib/secret.json']) writeFileSync(join(source, f), '{}');
    stage(source, dest, validate(input));
    assert(!readdirSync(dest).includes('.env'));
    assert.deepEqual(readdirSync(join(dest, 'lib')), ['test.mjs']);
    const cfg = JSON.parse(readFileSync(join(dest, 'railway.json')));
    assert.equal(cfg.deploy.cronSchedule, '*/15 * * * *'); assert.equal(cfg.deploy.numReplicas, 1); assert.equal(cfg.deploy.restartPolicyType, 'NEVER');
    rmSync(join(source, 'strategy.mjs')); symlinkSync(join(source, '.env'), join(source, 'strategy.mjs'));
    assert.throws(() => stage(source, dest, validate(input)), /symlink/);
  } finally { rmSync(source, { recursive: true }); rmSync(dest, { recursive: true }); }
});
test('deployment uses explicit targets, disables live trading and never fetches credentials', () => {
  const calls = [];
  const result = run('deploy', input, undefined, args => {
    calls.push(args);
    if (args[0] === 'status') return JSON.stringify(status());
    if (args[0] === 'up') { assert(!readdirSync(args[1]).includes('.env')); return JSON.stringify({ deploymentId }); }
    return '{}';
  });
  assert.equal(result.deploymentId, deploymentId); assert.equal(result.verifiedDryRun, false);
  assert.deepEqual(calls.map(c => c[0]), ['whoami', 'status', 'volume', 'variable', 'up']);
  assert(calls[3].includes('BOT_LIVE_TRADING_ENABLED=false')); assert(calls[3].includes('--skip-deploys'));
  assert(calls[4].includes('--path-as-root'));
  for (const c of calls.slice(1)) { assert(c.includes('--project')); assert(c.includes('--environment')); }
});
test('failed authentication makes no mutations; unknown upload is never automatically retried', () => {
  const calls = [];
  assert.throws(() => run('deploy', input, undefined, args => { calls.push(args); throw new Error('auth'); }), /auth/);
  assert.equal(calls.length, 1);
  let uploads = 0;
  assert.throws(() => run('deploy', input, undefined, args => { if (args[0] === 'status') return JSON.stringify(status()); if (args[0] === 'up') uploads++; return '{}'; }), /outcome unknown/);
  assert.equal(uploads, 1);
});
test('verification requires the selected deployment and completed preview marker', () => {
  const marker = { event: 'hivetrade-preview-complete', deploymentId, volume: true, live: false };
  assert(verifyLogs(JSON.stringify({ message: JSON.stringify(marker) }), deploymentId));
  assert(!verifyLogs(JSON.stringify(marker), id));
  assert(!verifyLogs(JSON.stringify({ ...marker, live: true }), deploymentId));
  const exec = log => args => args[0] === 'deployment' ? JSON.stringify([{ id: deploymentId, status: 'SUCCESS' }]) : log;
  assert.equal(run('verify', input, deploymentId, exec('build succeeded')).verifiedDryRun, false);
  assert.equal(run('verify', input, deploymentId, exec(JSON.stringify(marker))).verifiedDryRun, true);
  assert.throws(() => run('verify', input, id, exec('')), /not found/);
});

import { preview } from '../scripts/railway-job.mjs';
test('preview wrapper removes signing keys, forces dry run, checks storage and rejects failures/timeouts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bot-preview-'));
  const bot = join(directory, 'fixture.mjs');
  const env = { RAILWAY_VOLUME_MOUNT_PATH: '/data', RAILWAY_DEPLOYMENT_ID: deploymentId, BOT_PRIVATE_KEY: 'never-forward', BOT_LIVE_TRADING_ENABLED: 'true', NODE_OPTIONS: '--bad-option' };
  try {
    writeFileSync(bot, `if (process.env.BOT_PRIVATE_KEY || process.env.NODE_OPTIONS || process.env.BOT_LIVE_TRADING_ENABLED !== 'false') process.exit(1); console.log(JSON.stringify({mode:'DRY RUN'}));`);
    assert.equal(await preview(env, { directory, bot }), true);
    assert.equal(await preview({ ...env, RAILWAY_VOLUME_MOUNT_PATH: '/wrong' }, { directory, bot }), false);
    writeFileSync(bot, `console.log(JSON.stringify({mode:'DRY RUN'})); process.exit(1);`);
    assert.equal(await preview(env, { directory, bot }), false);
    writeFileSync(bot, `console.log('not evidence');`);
    assert.equal(await preview(env, { directory, bot }), false);
    writeFileSync(bot, `setInterval(()=>{},1000);`);
    assert.equal(await preview(env, { directory, bot, timeout: 30 }), false);
  } finally { rmSync(directory, { recursive: true }); }
});
