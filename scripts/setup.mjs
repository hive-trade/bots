import { readFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createIdentity } from '../lib/setup.mjs';
// Exclusive creation at private permissions; never print or overwrite a secret.
const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const address = createIdentity({ template, generatePrivateKey, privateKeyToAccount });
console.log(`Public signing address: ${address}`);
console.log('Private key saved only in .env. Register the public address, then edit .env locally.');
