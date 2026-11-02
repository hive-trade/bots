// HiveTrade bot kit MCP tools. Runs on the person's own computer, next to
// their .env. Deliberately absent: posting a Call, enabling live trading,
// funding, and any account credential. No tool output ever contains the
// private key or any other .env value except the few public fields below.
// Tools never create the key either: the person runs npm run setup in their
// own terminal. .env is read only through env-file.mjs helpers that leave the
// key out (readPublicSettings) or wrap it in a signer that exposes only the
// public address (botSigner).
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readPublicSettings, botSigner, updateEnv, envPath, isSettable, SETTABLE_KEYS } from './env-file.mjs';
import { loadDeps } from './deps.mjs';
import { findPolymarketMarket } from '../lib/find-market.mjs';

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
const SETUP_COMMAND = 'npm run setup';
const NO_ENV = `No .env yet. The person creates the signing key: ask them to run \`${SETUP_COMMAND}\` in their own terminal, in the bot folder, and to give you the public address it prints. Do not run it yourself.`;
function needEnvAndSigner(dir, deps) {
  const env = readPublicSettings(dir);
  if (!env) throw new Error(NO_ENV);
  // Missing dependencies are reported as such by botSigner, never as a bad key.
  const account = botSigner(dir, deps?.privateKeyToAccount);
  if (!account) throw new Error('BOT_PRIVATE_KEY in .env is empty or not a 0x-prefixed 64-character hex key. Restore .env from your backup. Only if the key is truly lost, create a new identity in a new folder. Never paste a key in chat.');
  return { env, account };
}
function hiveIdOf(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || String(value).trim() !== String(id)) throw new Error('hiveId must be a positive whole number');
  return id;
}
// Polymarket live trading for NEW bots is not self-serve yet (owner decision
// 2026-10-25): HiveTrade will place the Captain leg in the Hive owner's own
// HiveTrade account, and the bot will only sign Calls. Until that API lands,
// a new Polymarket bot can be created and dry-run, not traded live.
const POLYMARKET_NOT_SELF_SERVE = 'Polymarket live trading for new bots is not self-serve yet: new Polymarket bots will trade from the person\'s own HiveTrade account, which HiveTrade is still building. Creating the Hive and dry runs work today. Never tell the person to fund a bot address, sign in to Polymarket as the bot, or import the bot\'s key into a wallet app.';
async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

export function setupStatus({ dir, deps }) {
  const kit = existsSync(join(dir, 'bot.mjs'));
  const status = { botDir: dir, kitPresent: kit, dependenciesInstalled: existsSync(join(dir, 'node_modules', 'viem')), envFile: false };
  const env = readPublicSettings(dir);
  if (env) {
    status.envFile = true;
    status.envFilePrivate = (statSync(envPath(dir)).mode & 0o077) === 0;
    const account = deps ? botSigner(dir, deps.privateKeyToAccount) : null;
    status.signingAddress = account ? account.address : null;
    if (!deps) status.keyProblem = 'Dependencies are not installed, so the key was not checked. Run npm ci.';
    else if (!account) status.keyProblem = 'BOT_PRIVATE_KEY is missing or malformed';
    status.venue = env.VENUE || null;
    status.apiUrl = env.BOT_API_URL || ENVIRONMENTS.prod.api;
    status.environment = environmentForApi(status.apiUrl) ?? 'unknown';
    status.hiveId = env.BOT_HIVE_ID || null;
    if (env.VENUE === 'polymarket') {
      status.polymarketDepositWallet = ADDRESS.test(env.POLYMARKET_DEPOSIT_WALLET ?? '') ? env.POLYMARKET_DEPOSIT_WALLET : null;
      status.market = env.MARKET_SLUG || null;
    }
    if (env.VENUE === 'kalshi') status.market = env.KALSHI_TICKER || (env.KALSHI_SERIES ? `series ${env.KALSHI_SERIES} (the market open right now)` : null);
    status.liveTradingEnabled = env.BOT_LIVE_TRADING_ENABLED ?? 'false (unset)';
  }
  status.nextStep = !kit ? 'Clone https://github.com/hive-trade/bots into this folder and run npm ci.'
    : !status.dependenciesInstalled ? 'Run npm ci.'
    : !env ? `The person creates the signing key: they run \`${SETUP_COMMAND}\` in their own terminal in this folder and give you the public address. Do not run it yourself.`
    : !status.signingAddress ? 'The signing key in .env is missing or malformed. The person restores .env from their backup; never paste a key in chat, and never open .env.'
    : !status.hiveId ? 'Create the Hive: prepare_registration, then check_registration once the person pressed Create.'
    : !status.market ? 'Choose the exact market (KALSHI_TICKER or MARKET_SLUG) and implement the strategy, then dry_run.'
    : env.VENUE === 'polymarket' && !status.polymarketDepositWallet ? `Run the tests and dry_run. ${POLYMARKET_NOT_SELF_SERVE}`
    : 'Run the tests and dry_run. Live trading stays off until the person decides otherwise.';
  return status;
}

// The person creates the key themselves (owner decision 2026-10-25). This tool
// only says how; it creates nothing and runs nothing.
export function signingKeyCommand({ dir, deps }, args = {}) {
  requireKit(dir);
  if (existsSync(envPath(dir))) {
    const signer = deps ? botSigner(dir, deps.privateKeyToAccount) : null;
    return { done: true, signingAddress: signer?.address ?? null,
      note: signer ? 'The signing key already exists. This is its public address; check it matches the one the person gave you.' : '.env exists but its key could not be read. The person restores .env from their backup.' };
  }
  if (args.environment !== undefined && !ENVIRONMENTS[args.environment]) throw new Error('environment must be "prod" or "dev"');
  const command = args.environment === 'dev' ? `${SETUP_COMMAND} -- --dev` : SETUP_COMMAND;
  return { done: false, folder: dir, command, environment: args.environment ?? 'prod',
    tellThePerson: [
      `Open a terminal on your computer, go to the bot folder (${dir}) and run: ${command}`,
      'It prints one line with your bot\'s public address. Copy that address and give it to me.',
      'Your private key is saved in .env on your computer. Never share it, and keep a private backup of .env.',
    ],
    agentRules: 'Do not run the command yourself. Never read, print, grep or open .env. Use get_setup_status to confirm the address once the person ran it.' };
}
export function updateSettings({ dir }, args = {}) {
  if (!readPublicSettings(dir)) throw new Error(NO_ENV);
  const settings = args.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length === 0) throw new Error('settings must be an object such as { "MARKET_SLUG": "..." }');
  const updates = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!isSettable(key)) throw new Error(`${key} cannot be changed with this tool. Settable: ${SETTABLE_KEYS.join(', ')}. The live-trading switch is the person's own decision.`);
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${key} must be text or a number`);
    if (String(value).length > 250) throw new Error(`${key} is too long`);
    updates[key] = String(value);
  }
  updateEnv(dir, updates);
  return { wroteToEnv: Object.keys(updates) };
}

export function prepareRegistration({ dir, deps }, args = {}) {
  const { env, account } = needEnvAndSigner(dir, deps);
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (name.length < 3 || name.length > 40) throw new Error('name must be 3 to 40 characters');
  const bio = typeof args.bio === 'string' ? args.bio.trim() : '';
  if (bio.length > 500) throw new Error('bio must be at most 500 characters');
  if (!['polymarket', 'kalshi'].includes(args.venue)) throw new Error('venue must be "polymarket" or "kalshi"');
  const environment = pickEnvironment(args.environment, env);
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
  // The Hive will exist on THIS environment only, so check_registration must
  // ask the same API. Without recording the choice, a dev link followed by a
  // lookup that defaulted to prod could never find the Hive.
  const currentApi = env.BOT_API_URL || ENVIRONMENTS.prod.api;
  if (currentApi !== ENVIRONMENTS[environment].api) {
    if (env.BOT_HIVE_ID) {
      throw new Error(`This bot is already registered on ${environmentForApi(currentApi) ?? currentApi} (BOT_HIVE_ID ${env.BOT_HIVE_ID}). A signing address belongs to one Hive; use a new bot folder for the other environment.`);
    }
    updateEnv(dir, { BOT_API_URL: ENVIRONMENTS[environment].api });
  }
  return { url, environment, signingAddress: account.address,
    instructions: [
      'Open the link in the browser where you are signed in to HiveTrade (sign in first if asked; the form stays filled).',
      `Check that the signing address on the form is exactly ${account.address}. If it differs, do not create the Hive.`,
      'Review the name, description, category, venue and per-call cap. Add a description if it is empty.',
      'Press Create bot Hive yourself. A bot Hive has no agreement checkbox.',
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
      ...(venue === 'polymarket' && !ADDRESS.test(env.POLYMARKET_DEPOSIT_WALLET ?? '') ? { polymarketLiveTrading: POLYMARKET_NOT_SELF_SERVE } : {}),
      wroteToEnv: Object.keys(updates), ...(changed.length ? { replaced: changed } : {}) };
  }
  if (response.status === 404 && body?.code === 'BOT_NOT_REGISTERED') {
    return { registered: false, environment, signingAddress: account.address,
      message: 'Not created yet. Ask the person to open the link, check the signing address and press Create. If they already did, the Hive may have been created with a different signing address or on the other environment.' };
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
  if (!readPublicSettings(dir)) throw new Error(NO_ENV);
  updateEnv(dir, { BOT_HIVE_ID: String(hiveId) });
  return { hiveId, wroteToEnv: ['BOT_HIVE_ID'] };
}

async function signedRead({ api, path, message, account, fetch, now }) {
  const issuedAt = now();
  const signature = await account.signMessage({ message: `${message}:${issuedAt}` });
  const response = await fetch(`${api}${path}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issuedAt, signature }) });
  return { status: response.status, body: await readJson(response) };
}
// Confirms the Hive with requests signed by the bot's key, so it works for a
// Private Hive (the form's default), which the public lookup cannot see.
export async function botStatus({ dir, deps, fetch = globalThis.fetch, now = Date.now }, args = {}) {
  const { env, account } = needEnvAndSigner(dir, deps);
  if (!env.BOT_HIVE_ID) throw new Error('BOT_HIVE_ID is not set yet. Finish registration first (check_registration).');
  const hiveId = hiveIdOf(env.BOT_HIVE_ID);
  const environment = pickEnvironment(args.environment, env);
  const { api, web } = ENVIRONMENTS[environment];
  const budget = await signedRead({ api, path: '/api/bot/budget', message: 'hivetrade:bot-budget', account, fetch, now });
  if (budget.status === 401 && /not a registered bot/i.test(String(budget.body?.error ?? ''))) {
    return { hiveId, environment, found: false, signingAddress: account.address,
      message: `No bot Hive on ${environment} uses this signing address. If the person pressed Create, check which site they used (production or dev) and that the form showed this signing address.` };
  }
  if (budget.status === 401) throw new Error('HiveTrade rejected the signed status read (HTTP 401). The most common cause is a wrong computer clock: sync the system time and try again.');
  if (budget.status !== 200) throw new Error(`Status read failed: HTTP ${budget.status}. Nothing was changed.`);
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (num(budget.body?.hiveId) !== hiveId) {
    return { hiveId, environment, found: true, hiveIdMismatch: true, keyBelongsToHive: num(budget.body?.hiveId),
      message: `This signing key belongs to Hive ${budget.body?.hiveId}, but BOT_HIVE_ID in .env is ${hiveId}. Run check_registration to correct .env.` };
  }
  const status = { hiveId, environment, found: true, confirmedBy: 'a request signed by the bot\'s key',
    perCallCapUsd: num(budget.body.maxStakeUsd), openCalls: num(budget.body.openCallCount),
    paused: typeof budget.body.paused === 'boolean' ? budget.body.paused : null, page: `${web}/hive/${hiveId}` };
  const who = await signedRead({ api, path: '/api/bot/whoami', message: 'hivetrade:bot-whoami', account, fetch, now }).catch(() => null);
  if (who?.status === 200) Object.assign(status, { name: who.body?.name ?? null, handle: who.body?.handle ?? null, venue: who.body?.venue ?? null });
  if ((status.venue ?? env.VENUE) === 'polymarket' && !ADDRESS.test(env.POLYMARKET_DEPOSIT_WALLET ?? '')) status.polymarketLiveTrading = POLYMARKET_NOT_SELF_SERVE;
  // Public page data is extra. A Private Hive is not public, and that is expected.
  const response = await fetch(`${api}/api/hives/${hiveId}`, { redirect: 'error', signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (response?.ok) {
    const hive = await readJson(response) ?? {};
    const markets = Array.isArray(hive.recentMarkets) ? hive.recentMarkets : [];
    const last = markets.filter(m => m && typeof m.createdAt === 'string')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    Object.assign(status, { publicPage: true,
      name: status.name ?? hive.displayName ?? hive.name ?? null, handle: status.handle ?? hive.username ?? null,
      venue: status.venue ?? hive.executionVenue ?? null,
      memberCount: num(hive.memberCount), resolvedCalls: num(hive.resolvedCalls),
      lastCall: last ? { question: last.question ?? null, side: last.influencerPosition ?? last.captainPosition?.side ?? null,
        status: last.status ?? null, createdAt: last.createdAt } : null });
  } else {
    status.publicPage = false;
    status.note = 'The Hive exists (confirmed by the signed read). Its page is not public, which is normal for a Private Hive, the form\'s default. Member count and recent Calls are not shown.';
  }
  return status;
}

export function listStrategies() {
  return [
    'Your strategy lives in strategy.mjs. It receives a market with question, yesAsk and noAsk (0 to 1) and returns null or { skip: true, reasons } to skip, or { side: "yes" | "no", maxPrice, reasons } to trade. maxPrice is inclusive. reasons (optional) is a list of short text lines the dry run prints as TRACE lines.',
    'The example rule\'s tests are in test/example-strategy.test.mjs: replace that file with tests for the new rule. The other test files test the kit and never load strategy.mjs.',
    'The included rule is an educational price limit (EXAMPLE_SIDE + EXAMPLE_MAX_PRICE). It has no predictive edge.',
    'Read strategy-playbook.md for generic ideas (price limit, your own probability estimate versus the ask, observation-only) and what to decide first: exact market, resolution source, data freshness, price limit, budget, failure behavior.',
    'Entry points: bot.mjs (shared runner), examples/bot-starter/bot.mjs (Polymarket), examples/kalshi-bot-starter/ (Kalshi). Kalshi markets: the series HiveTrade\'s bot API accepts are listed at https://docs.hivetrade.com/run-a-bot/kalshi (copied in lib/kalshi-markets.mjs). Set KALSHI_TICKER for one fixed market, or KALSHI_SERIES to use the market of that series open right now (only when exactly one is open).',
    'Keep execution code separate from the strategy, and add tests for stale or missing data. HiveTrade\'s own production strategies are private and not part of this kit.',
  ].join('\n');
}

export function deployGuide() {
  return [
    'Hosting guide: docs/railway.md, skill: skills/hivetrade-deploy/SKILL.md.',
    'npm run railway -- plan|deploy|verify <public config>.json sets up a NEW empty Railway service with a /data volume, one replica, no restarts and a cron schedule (5 to 60 minutes).',
    'Practice only: the hosted job is a scheduled dry run that always runs with live trading off and is given no signing key, so it never places a real order. Say so before the person pays for hosting. Real trading works only on their own computer today. Verify with the deployment UUID after a scheduled run.',
    'npm run railway -- plan works before the Railway UUIDs exist and lists the missing ones.',
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
  if (!existsSync(envPath(dir))) throw new Error(NO_ENV);
  // Values set here win over .env (node --env-file never overrides the
  // environment), so the run is forced to preview mode without a key.
  const childEnv = { ...env, BOT_LIVE_TRADING_ENABLED: 'false', BOT_PRIVATE_KEY: '' };
  delete childEnv.NODE_OPTIONS;
  // A dry run needs no Hive ID (lib/config.mjs), so it works before registration.
  const hiveIdSet = Boolean(readPublicSettings(dir)?.BOT_HIVE_ID || env.BOT_HIVE_ID);
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
        ...(hiveIdSet ? {} : { hiveId: 'Not set yet. A dry run does not need it; real trading does.' }),
        stdout: tail(stdout), stderr: tail(stderr),
        note: 'Dry run only: live trading was forced off and no key was given to the run. It submitted no intent, order or fill. It does not prove funding, permissions or that a live order would fill.' });
    });
  });
}

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const environmentProp = { type: 'string', enum: ['prod', 'dev'], description: 'HiveTrade environment. Defaults to BOT_API_URL in .env, else prod.' };
export const TOOLS = [
  { name: 'get_setup_status', description: 'Which setup steps are done for the bot in this folder: kit, dependencies, signing identity (public address only), Hive ID, venue, market, live trading flag (and an older bot\'s Polymarket deposit wallet). Never returns secrets.', inputSchema: object(),
    run: ctx => setupStatus(ctx) },
  { name: 'get_signing_key_command', description: 'The command the PERSON runs in their own terminal to create the bot\'s signing key (npm run setup), and what to tell them. Creates nothing. Never run that command yourself. If the key exists, returns only its public address.', inputSchema: object({ environment: environmentProp }),
    run: (ctx, args) => signingKeyCommand(ctx, args) },
  { name: 'update_settings', description: 'Change public bot settings in .env (market, stake, venue, example or STRATEGY_* values) so you never open .env. Refuses the key, the live-trading switch, the Hive ID and the API.',
    inputSchema: object({ settings: { type: 'object', description: `Keys: ${SETTABLE_KEYS.join(', ')}`, additionalProperties: { type: ['string', 'number'] } } }, ['settings']),
    run: (ctx, args) => updateSettings(ctx, args) },
  { name: 'prepare_registration', description: 'Build a pre-filled "Create a bot Hive" link for this bot\'s signing address. The person opens it, checks the address and presses Create. Submits nothing.',
    inputSchema: object({ name: { type: 'string', description: '3 to 40 characters' }, bio: { type: 'string', description: 'Up to 500 characters' },
      category: { type: 'string', enum: CATEGORIES }, venue: { type: 'string', enum: ['polymarket', 'kalshi'] },
      maxStakeUsd: { type: 'number', minimum: 1, maximum: 100, description: 'Per-call cap in USD' },
      environment: environmentProp }, ['name', 'venue']),
    run: (ctx, args) => prepareRegistration(ctx, args) },
  { name: 'check_registration', description: 'Ask HiveTrade, with a request signed by the bot\'s key, whether the Hive was created. On success writes BOT_HIVE_ID (and BOT_API_URL, VENUE) to .env.', inputSchema: object({ environment: environmentProp }),
    run: (ctx, args) => checkRegistration(ctx, args) },
  { name: 'set_hive_id', description: 'Write BOT_HIVE_ID to .env. Use when the person reads the Hive ID from the page and the automatic lookup is unavailable.', inputSchema: object({ hiveId: { type: 'integer', minimum: 1 } }, ['hiveId']),
    run: (ctx, args) => setHiveId(ctx, args) },
  { name: 'get_bot_status', description: 'Confirms the bot\'s Hive with requests signed by its key (works for a Private Hive): name, venue, per-call cap, open Calls, paused. Adds member count and last Call when the Hive is public.', inputSchema: object({ environment: environmentProp }),
    run: (ctx, args) => botStatus(ctx, args) },
  { name: 'find_market', description: 'Turn a polymarket.com link (or slug) into the exact MARKET_SLUG. An event link with many markets returns the list; the person picks one. Public read-only lookup. Never suggest or rank markets.',
    inputSchema: object({ link: { type: 'string', description: 'polymarket.com/event/... link, or a slug' } }, ['link']),
    run: (ctx, args) => findPolymarketMarket(args.link, ctx.request ? { request: ctx.request } : {}) },
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
    // A caller that passes no deps (a script importing this file, not the
    // server) gets them loaded here, instead of a false "no valid key".
    let context = ctx ?? {};
    if (!context.deps) {
      const deps = await loadDeps().catch(() => null);
      if (deps) context = { ...context, deps };
    }
    const result = await tool.run(context, args ?? {});
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    if (KEY_PATTERN.test(text)) throw new Error('Refusing to return output that looks like a private key');
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = String(error?.message ?? 'Failed');
    return { isError: true, content: [{ type: 'text', text: KEY_PATTERN.test(message) ? 'Failed (details hidden)' : message }] };
  }
}
