// npm run setup [-- --dev | --prod]: the PERSON runs this in their own
// terminal, not their agent. It creates the bot's signing key, saves it only
// in .env (mode 0600, never overwritten) and prints only the public address to
// give to the agent. --dev points the bot at HiveTrade's dev site (which still
// trades real money); the default is production.
import { existsSync, readFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createIdentity } from '../lib/setup.mjs';
import { publicSigningAddress } from '../mcp/env-file.mjs';
const API = { '--prod': 'https://api.hivetrade.com', '--dev': 'https://api-dev.hivetrade.com' };
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => !API[arg])) {
  console.error('Usage: npm run setup (production) or npm run setup -- --dev (dev site, still real money)');
  process.exit(1);
}
if (existsSync('.env')) {
  const address = publicSigningAddress('.', privateKeyToAccount);
  console.error('.env already exists, so no new key was made.');
  if (address) console.error(`Your bot's public address: ${address}`);
  process.exitCode = 1;
} else {
  let template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  if (args[0]) template = template.replace(/^BOT_API_URL=.*$/m, `BOT_API_URL=${API[args[0]]}`);
  const address = createIdentity({ template, generatePrivateKey, privateKeyToAccount });
  console.log(`Your bot's public address: ${address}`);
  console.log('Give this address to your agent. Your private key was saved in .env; never share it.');
}
