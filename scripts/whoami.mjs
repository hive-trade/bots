// npm run whoami: asks HiveTrade, with a request signed by the bot's key,
// which Hive this key belongs to, and checks BOT_HIVE_ID in .env against it.
// Prints only public facts; never the key. Changes nothing.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPublicSettings, botSigner } from '../mcp/env-file.mjs';
const ENVIRONMENTS = { 'https://api.hivetrade.com': 'production', 'https://api-dev.hivetrade.com': 'dev' };

export async function whoami({ dir = '.', privateKeyToAccount, fetch = globalThis.fetch, now = Date.now } = {}) {
  const settings = readPublicSettings(dir);
  if (!settings) return { ok: false, lines: ['No .env yet. Run npm run setup first (in your own terminal).'] };
  const signer = botSigner(dir, privateKeyToAccount);
  if (!signer) return { ok: false, lines: ['The signing key in .env is missing or malformed. Restore .env from your backup; never paste a key in chat.'] };
  const api = settings.BOT_API_URL || 'https://api.hivetrade.com';
  const environment = ENVIRONMENTS[api];
  if (!environment) return { ok: false, lines: ['BOT_API_URL must be https://api.hivetrade.com (production) or https://api-dev.hivetrade.com (dev).'] };
  const issuedAt = now();
  const signature = await signer.signMessage({ message: `hivetrade:bot-whoami:${issuedAt}` });
  const response = await fetch(`${api}/api/bot/whoami`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issuedAt, signature }) });
  let body = null;
  try { body = await response.json(); } catch {}
  const lines = [`Signing address: ${signer.address} (${environment})`];
  if (response.status === 404 && body?.code === 'BOT_NOT_REGISTERED') return { ok: false, lines: [...lines, `No bot Hive on ${environment} uses this signing address yet. If you pressed Create, check you used the ${environment} site and that the form showed this address.`] };
  if (response.status === 404) return { ok: false, lines: [...lines, 'This HiveTrade API cannot look up a bot by its signing address yet. Save the Hive ID the page showed with: npm run set-hive -- <ID>'] };
  if (response.status === 401) return { ok: false, lines: [...lines, 'HiveTrade rejected the signed lookup (HTTP 401). Usually the computer clock is wrong: sync it and try again.'] };
  if (response.status !== 200 || !Number.isSafeInteger(body?.hiveId)) return { ok: false, lines: [...lines, `Lookup failed: HTTP ${response.status}.`] };
  lines.push(`Hive ${body.hiveId}: ${body.name ?? '(no name)'}${body.handle ? ` (@${body.handle})` : ''}, venue ${body.venue ?? 'unknown'}`);
  const saved = settings.BOT_HIVE_ID || '';
  if (saved === String(body.hiveId)) lines.push(`BOT_HIVE_ID in .env: ${saved} (matches)`);
  else if (!saved) lines.push(`BOT_HIVE_ID in .env: not set. Save it with: npm run set-hive -- ${body.hiveId}`);
  else lines.push(`BOT_HIVE_ID in .env: ${saved}, which does NOT match. Fix it with: npm run set-hive -- ${body.hiveId}`);
  if (body.venue && settings.VENUE && settings.VENUE !== body.venue) lines.push(`VENUE in .env is ${settings.VENUE}, but this Hive is ${body.venue}. Fix it with: npm run settings -- VENUE=${body.venue}`);
  return { ok: true, lines };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { privateKeyToAccount } = await import('viem/accounts');
  try {
    const result = await whoami({ privateKeyToAccount });
    (result.ok ? console.log : console.error)(result.lines.join('\n'));
    if (!result.ok) process.exitCode = 1;
  } catch { console.error('The lookup could not reach HiveTrade. Check your connection and try again.'); process.exitCode = 1; }
}
