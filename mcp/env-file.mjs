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
