// Railway preview job. Deliberately cannot enable the starter's live-trading path.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function preview(env = process.env, { directory = '/data/hivetrade', bot = resolve('bot.mjs'), timeout = 120000 } = {}) {
  try {
    if (env.RAILWAY_VOLUME_MOUNT_PATH !== '/data' || !env.RAILWAY_DEPLOYMENT_ID) throw new Error('Missing Railway volume or deployment');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const probe = `${directory}/.probe-${randomUUID()}`;
    writeFileSync(probe, 'ok', { mode: 0o600, flag: 'wx', flush: true });
    if (readFileSync(probe, 'utf8') !== 'ok') throw new Error('Volume check failed');
    unlinkSync(probe);
    // Give the example no signing credentials, even if a user added them to the service.
    const keys = ['PATH', 'NODE_ENV', 'VENUE', 'BOT_API_URL', 'BOT_HIVE_ID', 'EXAMPLE_SIDE', 'EXAMPLE_MAX_PRICE', 'SIGNAL_STRENGTH', 'MAX_STAKE_USD', 'KALSHI_TICKER', 'KALSHI_CONTRACTS', 'MARKET_SLUG', 'STAKE_USD'];
    const childEnv = Object.fromEntries(keys.filter(k => env[k] !== undefined).map(k => [k, env[k]]));
    Object.assign(childEnv, { BOT_LIVE_TRADING_ENABLED: 'false', STATE_DIR: directory });
    return await new Promise(resolveResult => {
      const child = spawn(process.execPath, [bot], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      let evidence = false;
      let buffer = '';
      child.stdout.on('data', data => {
        buffer += data.toString();
        // Never forward custom-strategy output, which could contain sensitive values.
        const lines = buffer.split('\n'); buffer = lines.pop().slice(-4096);
        for (const line of lines) {
          if (line === 'SKIP: example rule did not select a trade.') evidence = true;
          try { if (JSON.parse(line).mode === 'DRY RUN') evidence = true; } catch {}
        }
      });
      child.stderr.resume();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
      child.on('error', () => { clearTimeout(timer); console.error('Preview process could not start'); resolveResult(false); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0 || timedOut || !evidence) { console.error('Preview failed: check the public configuration, market availability and strategy locally.'); resolveResult(false); return; }
        console.log(JSON.stringify({ event: 'hivetrade-preview-complete', deploymentId: env.RAILWAY_DEPLOYMENT_ID, volume: true, live: false }));
        resolveResult(true);
      });
    });
  } catch { console.error('Persistent /data volume and Railway deployment context are required'); return false; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!await preview()) process.exitCode = 1;
}
