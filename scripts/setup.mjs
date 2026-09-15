import { readFileSync, writeFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
// Exclusive creation at private permissions; never print or overwrite a secret.
const key = generatePrivateKey();
const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
writeFileSync('.env', template.replace('BOT_PRIVATE_KEY=', `BOT_PRIVATE_KEY=${key}`), { flag: 'wx', mode: 0o600 });
console.log(`Public signing address: ${privateKeyToAccount(key).address}`);
console.log('Private key saved only in .env. Register the public address, then edit .env locally.');
