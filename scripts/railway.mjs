import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as botConfig } from '../lib/config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowed = new Set(['VENUE', 'BOT_API_URL', 'BOT_HIVE_ID', 'EXAMPLE_SIDE', 'EXAMPLE_MAX_PRICE', 'SIGNAL_STRENGTH', 'MAX_STAKE_USD', 'KALSHI_TICKER', 'KALSHI_CONTRACTS', 'MARKET_SLUG', 'STAKE_USD']);
export function validate(input) {
  if (!input || Object.keys(input).some(k => !['project', 'environment', 'service', 'intervalMinutes', 'variables'].includes(k))) throw new Error('Unknown deployment configuration field');
  for (const key of ['project', 'environment', 'service']) if (!uuid.test(input[key] ?? '')) throw new Error(`Set an explicit Railway ${key} UUID`);
  if (![5, 10, 15, 20, 30, 60].includes(input.intervalMinutes)) throw new Error('intervalMinutes must be 5, 10, 15, 20, 30 or 60');
  const variables = input.variables;
  if (!variables || Array.isArray(variables) || typeof variables !== 'object') throw new Error('Set public bot variables');
  for (const [key, value] of Object.entries(variables)) if (!allowed.has(key) || typeof value !== 'string' || value.length > 250 || /[\r\n\0]/.test(value)) throw new Error('Unsupported variable or value; never put credentials in this file');
  botConfig(variables);
  if (variables.VENUE === 'kalshi' && !/^KX(BTC|ETH|SOL)15M-[A-Z0-9-]+$/.test(variables.KALSHI_TICKER ?? '')) throw new Error('Set an exact supported Kalshi ticker');
  if (variables.VENUE === 'polymarket' && !/^[a-z0-9-]+$/.test(variables.MARKET_SLUG ?? '')) throw new Error('Set an exact Polymarket market slug');
  if (variables.EXAMPLE_SIDE && !['yes', 'no'].includes(variables.EXAMPLE_SIDE)) throw new Error('EXAMPLE_SIDE must be yes or no');
  if (variables.EXAMPLE_MAX_PRICE && !(Number(variables.EXAMPLE_MAX_PRICE) > 0 && Number(variables.EXAMPLE_MAX_PRICE) <= 0.99)) throw new Error('Invalid EXAMPLE_MAX_PRICE');
  return { ...input, variables: { ...variables, BOT_LIVE_TRADING_ENABLED: 'false', STATE_DIR: '/data/hivetrade' } };
}
function cli(args) {
  const result = spawnSync('railway', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Railway ${args[0]} failed. Check the selected service in Railway; no automatic retry was attempted. Raw CLI output is suppressed.`);
  return result.stdout;
}
export function targetArgs(c) { return ['--project', c.project, '--environment', c.environment, '--service', c.service]; }
export function inspectTarget(status, c) {
  if (status.id !== c.project) throw new Error('Project mismatch');
  const env = status.environments?.edges?.map(e => e.node).find(e => e.id === c.environment);
  if (!env || env.deletedAt || env.canAccess === false) throw new Error('Environment unavailable');
  const service = env.serviceInstances?.edges?.map(e => e.node).find(s => s.serviceId === c.service);
  if (!service) throw new Error('Service not found in this environment');
  if (service.source?.repo || service.source?.image || service.latestDeployment) throw new Error('Use a new, empty dedicated service. This helper will not overwrite an existing deployment.');
  const volumes = env.volumeInstances?.edges?.map(e => e.node).filter(v => v.serviceId === c.service) ?? [];
  if (volumes.length > 1 || volumes.some(v => v.mountPath !== '/data' || v.isPendingDeletion || v.deletedAt)) throw new Error('Existing volume conflicts with the required /data mount');
  return volumes.length === 1;
}
export function stage(source, destination, c) {
  const files = ['bot.mjs', 'strategy.mjs', 'package.json', 'package-lock.json', 'scripts/railway-job.mjs', ...readdirSync(join(source, 'lib')).filter(f => f.endsWith('.mjs')).map(f => `lib/${f}`)];
  for (const file of files) {
    // Reject linked parents as well as linked files: never follow an external lib directory.
    for (const part of [file.split('/')[0], file]) if (lstatSync(join(source, part)).isSymbolicLink()) throw new Error('Runtime symlinks are not supported');
    if (!lstatSync(join(source, file)).isFile()) throw new Error('Runtime input is not a file');
    mkdirSync(dirname(join(destination, file)), { recursive: true });
    cpSync(join(source, file), join(destination, file));
  }
  writeFileSync(join(destination, 'Dockerfile'), 'FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev --ignore-scripts\nCOPY . .\nCMD ["node", "scripts/railway-job.mjs"]\n');
  writeFileSync(join(destination, 'railway.json'), JSON.stringify({ '$schema': 'https://railway.com/railway.schema.json', build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' }, deploy: { startCommand: 'node scripts/railway-job.mjs', cronSchedule: c.intervalMinutes === 60 ? '0 * * * *' : `*/${c.intervalMinutes} * * * *`, numReplicas: 1, restartPolicyType: 'NEVER' } }, null, 2));
  return files;
}
export function verifyLogs(raw, deploymentId) {
  return raw.split('\n').some(line => {
    try {
      const outer = JSON.parse(line);
      const marker = typeof outer.message === 'string' ? JSON.parse(outer.message) : outer;
      return marker.event === 'hivetrade-preview-complete' && marker.deploymentId === deploymentId && marker.volume === true && marker.live === false;
    } catch { return false; }
  });
}
export function run(command, input, deploymentId, exec = cli, source = root) {
  const c = validate(input);
  if (command === 'plan') return { target: { project: c.project, environment: c.environment, service: c.service }, intervalMinutes: c.intervalMinutes, mode: 'dry-run only', volume: '/data', upload: 'bot.mjs, strategy.mjs, package files, lib/*.mjs, preview wrapper; no .env or local state' };
  if (!['deploy', 'verify'].includes(command)) throw new Error('Use plan, deploy or verify');
  if (command === 'verify') {
    if (!uuid.test(deploymentId ?? '')) throw new Error('Supply the deployment UUID returned by deploy');
    const deployments = JSON.parse(exec(['deployment', 'list', ...targetArgs(c), '--limit', '20', '--json']));
    const deployment = deployments.find(d => d.id === deploymentId);
    if (!deployment) throw new Error('Deployment not found in the selected service’s recent deployments');
    if (['FAILED', 'CRASHED', 'REMOVED'].includes(deployment.status.toUpperCase())) throw new Error('Deployment failed or was removed; inspect Railway');
    const complete = verifyLogs(exec(['logs', deploymentId, ...targetArgs(c), '--lines', '200', '--json']), deploymentId);
    return { deploymentId, status: deployment.status, verifiedDryRun: complete, next: complete ? 'Preview completed with persistent storage. No live trading was enabled.' : 'Not verified yet. Inspect build/runtime logs and repeat verify after a scheduled run.' };
  }
  // Stage and validate local files before making any remote changes.
  const directory = mkdtempSync(join(tmpdir(), 'hivetrade-preview-'));
  try {
    stage(source, directory, c);
    exec(['whoami', '--json']); // Do not allow `up` to initiate implicit login/project creation.
    const status = JSON.parse(exec(['status', '--project', c.project, '--environment', c.environment, '--json']));
    const hasVolume = inspectTarget(status, c);
    if (!hasVolume) exec(['volume', ...targetArgs(c), 'add', '--mount-path', '/data', '--json']);
    exec(['variable', 'set', ...Object.entries(c.variables).map(([k, v]) => `${k}=${v}`), ...targetArgs(c), '--skip-deploys', '--json']);
    const output = exec(['up', directory, ...targetArgs(c), '--path-as-root', '--detach', '--json']);
    const records = output.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const id = records.find(r => uuid.test(r.deploymentId ?? ''))?.deploymentId;
    if (!id) throw new Error('Upload outcome unknown. Inspect Railway before retrying; a deployment may already exist.');
    return { deploymentId: id, verifiedDryRun: false, next: `Run verify with this deployment UUID after build and the first scheduled run.` };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, file, id] = process.argv.slice(2);
    if (!command || !file) throw new Error('Usage: npm run railway -- plan|deploy|verify path/to/public-config.json [deployment-uuid]');
    const result = run(command, JSON.parse(readFileSync(file, 'utf8')), id);
    console.log(JSON.stringify(result, null, 2));
    if (command === 'verify' && !result.verifiedDryRun) process.exitCode = 2;
  } catch (error) { console.error(error instanceof SyntaxError ? 'Invalid JSON configuration or CLI response' : error.message); process.exitCode = 1; }
}
