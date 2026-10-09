import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Shared by `npm run setup` and the MCP `create_signing_key` tool. The key is
// written once, exclusively, at 0600, and only the public address is returned.
// Signing helpers are passed in so this file needs no third-party import.
export function createIdentity({ dir = '.', template, generatePrivateKey, privateKeyToAccount }) {
  if (!template.includes('BOT_PRIVATE_KEY=')) throw new Error('.env.example is missing BOT_PRIVATE_KEY=');
  const key = generatePrivateKey();
  const address = privateKeyToAccount(key).address;
  writeFileSync(join(dir, '.env'), template.replace('BOT_PRIVATE_KEY=', `BOT_PRIVATE_KEY=${key}`), { flag: 'wx', mode: 0o600 });
  return address;
}
