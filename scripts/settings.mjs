// npm run settings                 shows the bot's public settings (never the key)
// npm run settings -- KEY=value    changes a public setting (market, stake, ...)
// For agents: use this instead of opening .env, which they must never read.
import { readPublicSettings, updateEnv, isSettable, SETTABLE_KEYS } from '../mcp/env-file.mjs';
const settings = readPublicSettings('.');
if (!settings) { console.error('No .env yet. The person creates it by running npm run setup in their own terminal.'); process.exit(1); }
const changes = process.argv.slice(2);
if (changes.length === 0) {
  console.log(`BOT_PRIVATE_KEY: ${settings.signingKeyPresent ? 'set (hidden)' : 'missing or malformed'}`);
  for (const [key, value] of Object.entries(settings)) console.log(`${key}=${/0x[0-9a-fA-F]{64}/.test(value) ? '[hidden]' : value}`);
} else {
  const updates = {};
  for (const change of changes) {
    const at = change.indexOf('=');
    const key = at > 0 ? change.slice(0, at) : change;
    if (!isSettable(key)) { console.error(`${key} cannot be changed here. Settable: ${SETTABLE_KEYS.join(', ')}.`); process.exit(1); }
    updates[key] = change.slice(at + 1);
  }
  updateEnv('.', updates);
  console.log(`Updated ${Object.keys(updates).join(', ')} in .env.`);
}
