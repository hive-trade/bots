// Claude Code SessionStart hook for the plugin install. Claude Code skips its
// automatic dependency install for packages with npm `overrides` (this kit pins
// ws), so install the same lockfile into the plugin's data directory once per
// lockfile version. Silent on stdout: hook output would enter the conversation.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, closeSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.CLAUDE_PLUGIN_ROOT;
const data = process.env.CLAUDE_PLUGIN_DATA;
const READY = '.hivetrade-deps-ready';
if (root && data) {
  try {
    const lock = readFileSync(join(root, 'package-lock.json'));
    const hash = createHash('sha256').update(lock).digest('hex');
    let current = '';
    try { current = readFileSync(join(data, READY), 'utf8').trim(); } catch {}
    if (current !== hash) {
      mkdirSync(data, { recursive: true });
      rmSync(join(data, READY), { force: true });
      for (const file of ['package.json', 'package-lock.json']) copyFileSync(join(root, file), join(data, file));
      const log = openSync(join(data, 'install.log'), 'w');
      const result = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
        { cwd: data, stdio: ['ignore', log, log], timeout: 280000, shell: process.platform === 'win32' });
      closeSync(log);
      if (result.status === 0) writeFileSync(join(data, READY), hash);
      else console.error('hivetrade-bot: dependency install failed; see install.log in the plugin data directory');
    }
  } catch { console.error('hivetrade-bot: dependency install skipped'); }
}
