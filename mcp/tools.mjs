// HiveTrade bot kit MCP tools. Runs on the person's own computer, next to
// their .env. Deliberately absent: posting a Call, enabling live trading,
// funding, and any account credential. No tool output ever contains the
// private key or any other .env value except the few public fields below.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createIdentity } from '../lib/setup.mjs';
import { readEnv, updateEnv, envPath } from './env-file.mjs';

export const ENVIRONMENTS = {
  prod: { api: 'https://api.hivetrade.com', web: 'https://app.hivetrade.com' },
  dev: { api: 'https://api-dev.hivetrade.com', web: 'https://dev.hivetrade.com' },
};
// Same options as the Create a Hive form.
export const CATEGORIES = ['Politics', 'Sports', 'Crypto', 'Esports', 'Finance', 'Geopolitics', 'Tech', 'Culture', 'Economy', 'Weather'];
const KEY_PATTERN = /0x[0-9a-fA-F]{64}/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function botDir(env = process.env) {
  return resolve(env.HIVETRADE_BOT_DIR || env.CLAUDE_PROJECT_DIR || process.cwd());
}
function environmentForApi(api) {
  return Object.entries(ENVIRONMENTS).find(([, e]) => e.api === api)?.[0];
}
function pickEnvironment(name, env) {
  if (name !== undefined) {
    if (!ENVIRONMENTS[name]) throw new Error('environment must be "prod" or "dev"');
    return name;
  }
  const api = env?.BOT_API_URL || ENVIRONMENTS.prod.api;
  const found = environmentForApi(api);
  if (!found) throw new Error('BOT_API_URL in .env is not a documented HiveTrade API origin');
  return found;
}
function requireKit(dir) {
  if (!existsSync(join(dir, 'bot.mjs')) || !existsSync(join(dir, '.env.example'))) {
    throw new Error(`${dir} is not a copy of the bot kit. Clone https://github.com/hive-trade/bots there (or set HIVETRADE_BOT_DIR), run npm ci, then try again.`);
  }
}
function signer(env, deps) {
  const key = env?.BOT_PRIVATE_KEY ?? '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  try { return deps.privateKeyToAccount(key); } catch { return null; }
}
function needEnvAndSigner(dir, deps) {
  const env = readEnv(dir);
  if (!env) throw new Error('No .env yet. Run create_signing_key (or npm run setup) first.');
  const account = signer(env, deps);
  if (!account) throw new Error('.env has no valid signing key. Do not paste one in chat; create a new identity in an empty folder if needed.');
  return { env, account };
}
function hiveIdOf(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || String(value).trim() !== String(id)) throw new Error('hiveId must be a positive whole number');
  return id;
}
async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

export function setupStatus({ dir, deps }) {
  const kit = existsSync(join(dir, 'bot.mjs'));
  const status = { botDir: dir, kitPresent: kit, dependenciesInstalled: existsSync(join(dir, 'node_modules', 'viem')), envFile: false };
  const env = readEnv(dir);
  if (env) {
    status.envFile = true;
    status.envFilePrivate = (statSync(envPath(dir)).mode & 0o077) === 0;
    const account = signer(env, deps);
    status.signingAddress = account ? account.address : null;
    if (!account) status.keyProblem = 'BOT_PRIVATE_KEY is missing or malformed';
    status.venue = env.VENUE || null;
    status.apiUrl = env.BOT_API_URL || ENVIRONMENTS.prod.api;
    status.environment = environmentForApi(status.apiUrl) ?? 'unknown';
    status.hiveId = env.BOT_HIVE_ID || null;
    if (env.VENUE === 'polymarket') {
      status.polymarketDepositWallet = ADDRESS.test(env.POLYMARKET_DEPOSIT_WALLET ?? '') ? env.POLYMARKET_DEPOSIT_WALLET : null;
      status.market = env.MARKET_SLUG || null;
    }
    if (env.VENUE === 'kalshi') status.market = env.KALSHI_TICKER || null;
    status.liveTradingEnabled = env.BOT_LIVE_TRADING_ENABLED ?? 'false (unset)';
  }
  status.nextStep = !kit ? 'Clone https://github.com/hive-trade/bots into this folder and run npm ci.'
    : !status.dependenciesInstalled ? 'Run npm ci.'
    : !env ? 'Create the signing identity (create_signing_key or npm run setup).'
    : !status.signingAddress ? 'Fix the signing identity in .env locally; never paste a key in chat.'
    : !status.hiveId ? 'Create the Hive: prepare_registration, then check_registration once the person pressed Create.'
    : env.VENUE === 'polymarket' && !status.polymarketDepositWallet ? 'Polymarket: deploy and fund the bot\'s own deposit wallet, set POLYMARKET_DEPOSIT_WALLET, then npm run bind-wallet.'
    : !status.market ? 'Choose the exact market (KALSHI_TICKER or MARKET_SLUG) and implement the strategy, then dry_run.'
    : 'Run the tests and dry_run. Live trading stays off until the person decides otherwise.';
  return status;
}

export function createSigningKey({ dir, deps }) {
  requireKit(dir);
  if (existsSync(envPath(dir))) throw new Error('.env already exists; refusing to overwrite it. Use get_setup_status to see its public address.');
  const address = createIdentity({ dir, template: readFileSync(join(dir, '.env.example'), 'utf8'),
    generatePrivateKey: deps.generatePrivateKey, privateKeyToAccount: deps.privateKeyToAccount });
  return { signingAddress: address, envFile: envPath(dir),
    note: 'The private key is saved only in .env (mode 0600) and was not shown. Ask the person to keep a private backup of that file. Never commit it.' };
}

export function prepareRegistration({ dir, deps }, args = {}) {
  const { account } = needEnvAndSigner(dir, deps);
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (name.length < 3 || name.length > 40) throw new Error('name must be 3 to 40 characters');
  const bio = typeof args.bio === 'string' ? args.bio.trim() : '';
  if (bio.length > 500) throw new Error('bio must be at most 500 characters');
  if (!['polymarket', 'kalshi'].includes(args.venue)) throw new Error('venue must be "polymarket" or "kalshi"');
  const environment = pickEnvironment(args.environment ?? 'prod');
  const params = new URLSearchParams({ name });
  if (bio) params.set('bio', bio);
  if (args.category !== undefined && args.category !== '') {
    const category = CATEGORIES.find(c => c.toLowerCase() === String(args.category).trim().toLowerCase());
    if (!category) throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
    params.set('category', category);
  }
  params.set('venue', args.venue);
  params.set('signer', account.address);
  if (args.maxStakeUsd !== undefined) {
    const stake = Number(args.maxStakeUsd);
    if (!Number.isFinite(stake) || stake < 1 || stake > 100) throw new Error('maxStakeUsd must be between 1 and 100');
    params.set('maxStake', String(stake));
  }
  params.set('from', 'agent');
  const url = `${ENVIRONMENTS[environment].web}/bots/new?${params.toString().replace(/\+/g, '%20')}`;
  return { url, environment, signingAddress: account.address,
    instructions: [
      'Open the link in the browser where you are signed in to HiveTrade (sign in first if asked; the form stays filled).',
      `Check that the signing address on the form is exactly ${account.address}. If it differs, do not create the Hive.`,
      'Review the name, description, category, venue and per-call cap. Add a description if it is empty.',
      'Tick the Captain agreement yourself, then press Create.',
      'Tell your agent when it is done; it will look up the new Hive with check_registration.',
    ],
    note: 'Nothing was submitted. Only the person can create the Hive.' };
}

export async function checkRegistration({ dir, deps, fetch = globalThis.fetch, now = Date.now }, args = {}) {
  const { env, account } = needEnvAndSigner(dir, deps);
  const environment = pickEnvironment(args.environment, env);
  const api = ENVIRONMENTS[environment].api;
  const issuedAt = now();
  const signature = await account.signMessage({ message: `hivetrade:bot-whoami:${issuedAt}` });
  const response = await fetch(`${api}/api/bot/whoami`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issuedAt, signature }) });
  const body = await readJson(response);
  if (response.status === 200) {
    const hiveId = hiveIdOf(body?.hiveId);
    const venue = ['polymarket', 'kalshi'].includes(body?.venue) ? body.venue : null;
    const previous = { hiveId: env.BOT_HIVE_ID || null, venue: env.VENUE || null };
    const updates = { BOT_HIVE_ID: String(hiveId), BOT_API_URL: api };
    // The Hive is bound to one venue; the template's default must follow it.
    if (venue) updates.VENUE = venue;
    updateEnv(dir, updates);
    const changed = [];
    if (previous.hiveId && previous.hiveId !== String(hiveId)) changed.push(`BOT_HIVE_ID was ${previous.hiveId}`);
    if (venue && previous.venue && previous.venue !== venue) changed.push(`VENUE was ${previous.venue}`);
    return { registered: true, environment, hiveId, name: body?.name ?? null, handle: body?.handle ?? null, venue,
      wroteToEnv: Object.keys(updates), ...(changed.length ? { replaced: changed } : {}) };
  }
  if (response.status === 404 && body?.code === 'BOT_NOT_REGISTERED') {
    return { registered: false, environment, signingAddress: account.address,
      message: 'Not created yet. Ask the person to open the link, check the signing address, tick the agreement and press Create. If they already did, the Hive may have been created with a different signing address or on the other environment.' };
  }
  if (response.status === 404) {
    return { registered: false, environment, lookupUnavailable: true,
      message: 'This HiveTrade API cannot look up a bot by its signing address yet. Ask the person for the Hive ID the page showed after Create, then call set_hive_id with it.' };
  }
  if (response.status === 401) throw new Error('HiveTrade rejected the signed lookup (HTTP 401). The most common cause is a wrong computer clock: sync the system time and try again.');
  throw new Error(`Lookup failed: HTTP ${response.status}. Nothing was changed.`);
}

export function setHiveId({ dir }, args = {}) {
  const hiveId = hiveIdOf(args.hiveId);
  if (!readEnv(dir)) throw new Error('No .env yet. Create the signing identity first.');
  updateEnv(dir, { BOT_HIVE_ID: String(hiveId) });
  return { hiveId, wroteToEnv: ['BOT_HIVE_ID'] };
}

export async function botStatus({ dir, fetch = globalThis.fetch }, args = {}) {
  const env = readEnv(dir);
  if (!env?.BOT_HIVE_ID) throw new Error('BOT_HIVE_ID is not set yet. Finish registration first.');
  const hiveId = hiveIdOf(env.BOT_HIVE_ID);
  const environment = pickEnvironment(args.environment, env);
  const response = await fetch(`${ENVIRONMENTS[environment].api}/api/hives/${hiveId}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return { hiveId, environment, found: false, message: 'No public Hive with this ID on this environment. Check BOT_HIVE_ID and BOT_API_URL.' };
  if (!response.ok) throw new Error(`Hive lookup failed: HTTP ${response.status}`);
  const hive = await readJson(response) ?? {};
  const markets = Array.isArray(hive.recentMarkets) ? hive.recentMarkets : [];
  const last = markets.filter(m => m && typeof m.createdAt === 'string')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { hiveId, environment, found: true,
    name: hive.displayName ?? hive.name ?? null, handle: hive.username ?? null,
    venue: hive.executionVenue ?? null, isBot: hive.isBot ?? null,
    memberCount: num(hive.memberCount), resolvedCalls: num(hive.resolvedCalls),
    page: `${ENVIRONMENTS[environment].web}/hive/${hiveId}`,
    lastCall: last ? { question: last.question ?? null, side: last.influencerPosition ?? last.captainPosition?.side ?? null,
      status: last.status ?? null, createdAt: last.createdAt } : null };
}

export function listStrategies() {
  return [
    'Your strategy lives in strategy.mjs. It receives a market with yesAsk and noAsk (0 to 1) and returns null to skip, or { side: "yes" | "no", maxPrice }.',
    'The included rule is an educational price limit (EXAMPLE_SIDE + EXAMPLE_MAX_PRICE). It has no predictive edge.',
    'Read strategy-playbook.md for generic ideas (price limit, your own probability estimate versus the ask, observation-only) and what to decide first: exact market, resolution source, data freshness, price limit, budget, failure behavior.',
    'Entry points: bot.mjs (shared runner), examples/bot-starter/bot.mjs (Polymarket), examples/kalshi-bot-starter/ (Kalshi; only KXBTC15M, KXETH15M and KXSOL15M tickers are accepted today).',
    'Keep execution code separate from the strategy, and add tests for stale or missing data. HiveTrade\'s own production strategies are private and not part of this kit.',
  ].join('\n');
}

export function deployGuide() {
  return [
    'Hosting guide: docs/railway.md, skill: skills/hivetrade-deploy/SKILL.md.',
    'npm run railway -- plan|deploy|verify <public config>.json sets up a NEW empty Railway service with a /data volume, one replica, no restarts and a cron schedule (5 to 60 minutes).',
    'The hosted job is a scheduled preview: it always runs with live trading off and is given no signing key. Verify with the deployment UUID after a scheduled run.',
    'The public config file holds public settings only. Never put .env contents, keys or tokens in it.',
    'Running live on a server is a separate decision by the person. If they make it, THEY set BOT_PRIVATE_KEY in the host\'s secret settings dashboard themselves. An agent never copies, uploads or types the key.',
    'Keep one instance and a persistent volume for STATE_DIR so duplicate protection survives redeploys.',
  ].join('\n');
}

function tail(text, lines = 40) {
  return text.split('\n').slice(-lines).map(line => (KEY_PATTERN.test(line) ? '[line hidden: it looked like it could contain a private key]' : line)).join('\n').trim();
}
export function dryRun({ dir, env = process.env, node = process.execPath, timeoutMs = 120000 }) {
  requireKit(dir);
  if (!existsSync(envPath(dir))) throw new Error('No .env yet. Create the signing identity first.');
  // Values set here win over .env (node --env-file never overrides the
  // environment), so the run is forced to preview mode without a key.
  const childEnv = { ...env, BOT_LIVE_TRADING_ENABLED: 'false', BOT_PRIVATE_KEY: '' };
  delete childEnv.NODE_OPTIONS;
  // Before registration there is no Hive ID; a preview never uses it, so a
  // placeholder lets the strategy be previewed first. Never written to .env.
  const placeholderHiveId = !readEnv(dir)?.BOT_HIVE_ID && !env.BOT_HIVE_ID;
  if (placeholderHiveId) childEnv.BOT_HIVE_ID = '1';
  return new Promise(done => {
    const child = spawn(node, ['--env-file=.env', 'bot.mjs'], { cwd: dir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-20000); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-20000); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', () => { clearTimeout(timer); done({ ok: false, liveTrading: false, error: 'Could not start node' }); });
    child.on('close', code => {
      clearTimeout(timer);
      done({ ok: code === 0 && !timedOut, exitCode: code, timedOut, liveTrading: false,
        ...(placeholderHiveId ? { placeholderHiveId: 'BOT_HIVE_ID is not set yet; the preview used a placeholder.' } : {}),
        stdout: tail(stdout), stderr: tail(stderr),
        note: 'Dry run only: live trading was forced off and no key was given to the run. It submitted no intent, order or fill. It does not prove funding, permissions or that a live order would fill.' });
    });
  });
}

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const environmentProp = { type: 'string', enum: ['prod', 'dev'], description: 'HiveTrade environment. Defaults to BOT_API_URL in .env, else prod.' };
export const TOOLS = [
  { name: 'get_setup_status', description: 'Which setup steps are done for the bot in this folder: kit, dependencies, signing identity (public address only), Hive ID, venue, Polymarket deposit wallet, market, live trading flag. Never returns secrets.', inputSchema: object(),
    run: ctx => setupStatus(ctx) },
  { name: 'create_signing_key', description: 'Create the bot\'s signing identity in .env (mode 0600) and return only its public address. Refuses if .env already exists.', inputSchema: object(),
    run: ctx => createSigningKey(ctx) },
  { name: 'prepare_registration', description: 'Build a pre-filled "Create a bot Hive" link for this bot\'s signing address. The person opens it, checks the address, ticks the agreement and presses Create. Submits nothing.',
    inputSchema: object({ name: { type: 'string', description: '3 to 40 characters' }, bio: { type: 'string', description: 'Up to 500 characters' },
      category: { type: 'string', enum: CATEGORIES }, venue: { type: 'string', enum: ['polymarket', 'kalshi'] },
      maxStakeUsd: { type: 'number', minimum: 1, maximum: 100, description: 'Per-call cap in USD' },
      environment: { type: 'string', enum: ['prod', 'dev'], description: 'Defaults to prod' } }, ['name', 'venue']),
    run: (ctx, args) => prepareRegistration(ctx, args) },
  { name: 'check_registration', description: 'Ask HiveTrade, with a request signed by the bot\'s key, whether the Hive was created. On success writes BOT_HIVE_ID (and BOT_API_URL, VENUE) to .env.', inputSchema: object({ environment: environmentProp }),
    run: (ctx, args) => checkRegistration(ctx, args) },
  { name: 'set_hive_id', description: 'Write BOT_HIVE_ID to .env. Use when the person reads the Hive ID from the page and the automatic lookup is unavailable.', inputSchema: object({ hiveId: { type: 'integer', minimum: 1 } }, ['hiveId']),
    run: (ctx, args) => setHiveId(ctx, args) },
  { name: 'get_bot_status', description: 'Public summary of the bot\'s Hive: name, venue, member count, last Call.', inputSchema: object({ environment: environmentProp }),
    run: (ctx, args) => botStatus(ctx, args) },
  { name: 'list_strategies', description: 'Where the strategy goes and the generic example ideas in this kit.', inputSchema: object(),
    run: () => listStrategies() },
  { name: 'get_deploy_guide', description: 'How to host the bot (scheduled previews on Railway) and who handles the key on a server.', inputSchema: object(),
    run: () => deployGuide() },
  { name: 'dry_run', description: 'Run the bot once with live trading forced off and no key. Returns the tail of its output with anything key-like hidden.', inputSchema: object(),
    run: ctx => dryRun(ctx) },
];

export async function callTool(name, args, ctx) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  try {
    const result = await tool.run(ctx, args ?? {});
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    if (KEY_PATTERN.test(text)) throw new Error('Refusing to return output that looks like a private key');
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = String(error?.message ?? 'Failed');
    return { isError: true, content: [{ type: 'text', text: KEY_PATTERN.test(message) ? 'Failed (details hidden)' : message }] };
  }
}
