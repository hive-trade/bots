// npm run setup: the PERSON runs this in their own terminal, not their agent.
// It creates the bot's signing key, saves it only in .env (mode 0600, never
// overwritten) and prints only the public address to give to the agent.
import { existsSync, readFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createIdentity } from '../lib/setup.mjs';
import { publicSigningAddress } from '../mcp/env-file.mjs';
if (existsSync('.env')) {
  const address = publicSigningAddress('.', privateKeyToAccount);
  console.error('.env already exists, so no new key was made.');
  if (address) console.error(`Your bot's public address: ${address}`);
  process.exitCode = 1;
} else {
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const address = createIdentity({ template, generatePrivateKey, privateKeyToAccount });
  console.log(`Your bot's public address: ${address}`);
  console.log('Give this address to your agent. Your private key was saved in .env; never share it.');
}
