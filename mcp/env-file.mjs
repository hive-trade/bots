import { readFileSync, writeFileSync, renameSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
// Minimal .env reader/writer for the MCP tools. Values stay inside this
// process: callers pick the few public fields they report, never the file.
export function envPath(dir) { return join(dir, '.env'); }
export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    values[match[1]] = value;
  }
  return values;
}
export function readEnv(dir) {
  try { return parseEnv(readFileSync(envPath(dir), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error('Could not read .env'); }
}
// Sets only the given keys; every other line is kept byte for byte. Written
// through a 0600 temp file and renamed, so the file is never briefly readable.
export function updateEnv(dir, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || key === 'BOT_PRIVATE_KEY') throw new Error('Refusing to write that setting');
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error(`Invalid value for ${key}`);
  }
  const file = envPath(dir);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    const index = lines.findIndex(line => pattern.test(line));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else {
      if (lines.at(-1) === '') lines.splice(-1, 0, `${key}=${value}`);
      else lines.push(`${key}=${value}`);
    }
  }
  const tmp = `${file}.tmp-${process.pid}`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, lines.join('\n'), { mode: 0o600, flag: 'wx' });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

// The only ways kit tools see .env. None of them returns the private key:
// settings come back with BOT_PRIVATE_KEY removed, and the signer is a closure
// that can sign a message and tell its public address, nothing more.
const KEY_FORMAT = /^0x[0-9a-fA-F]{64}$/;
export function readPublicSettings(dir) {
  const env = readEnv(dir);
  if (!env) return null;
  const { BOT_PRIVATE_KEY: key, ...settings } = env;
  return Object.defineProperty(settings, 'signingKeyPresent', { value: KEY_FORMAT.test(key ?? ''), enumerable: false });
}
export function botSigner(dir, privateKeyToAccount) {
  if (typeof privateKeyToAccount !== 'function') throw new Error('The kit\'s dependencies are not loaded, so the signing key could not be checked. Run npm ci in the bot folder. The key in .env was not changed.');
  const key = readEnv(dir)?.BOT_PRIVATE_KEY ?? '';
  if (!KEY_FORMAT.test(key)) return null;
  let account;
  try { account = privateKeyToAccount(key); } catch { return null; }
  return Object.freeze({ address: account.address, signMessage: ({ message }) => account.signMessage({ message }) });
}
export function publicSigningAddress(dir, privateKeyToAccount) {
  return botSigner(dir, privateKeyToAccount)?.address ?? null;
}
// Public settings the agent may change for the person, so it never has to
// open .env. Never the key, the live-trading switch, the Hive ID or the API
// (those have their own tools or are the person's decision).
const SETTABLE = new Set(['VENUE', 'MARKET_SLUG', 'STAKE_USD', 'MAX_STAKE_USD', 'KALSHI_TICKER', 'KALSHI_SERIES', 'KALSHI_CONTRACTS',
  'EXAMPLE_SIDE', 'EXAMPLE_MAX_PRICE', 'POLYMARKET_DEPOSIT_WALLET']);
export function isSettable(key) { return SETTABLE.has(key) || /^STRATEGY_[A-Z0-9_]+$/.test(key); }
export const SETTABLE_KEYS = [...SETTABLE, 'STRATEGY_*'];
