import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
// From a clone, dependencies come from the kit's own node_modules (npm ci).
// As a Claude Code plugin, the kit's npm `overrides` keep Claude Code from
// installing them, so hooks/install-deps.mjs installs the same lockfile into
// the plugin's data directory and the server loads them from there.
export const READY_MARKER = '.hivetrade-deps-ready';
const SPECS = ['@modelcontextprotocol/sdk/server/index.js', '@modelcontextprotocol/sdk/server/stdio.js', '@modelcontextprotocol/sdk/types.js', 'viem/accounts'];
function pick([server, stdio, types, accounts]) {
  return { Server: server.Server, StdioServerTransport: stdio.StdioServerTransport,
    ListToolsRequestSchema: types.ListToolsRequestSchema, CallToolRequestSchema: types.CallToolRequestSchema,
    generatePrivateKey: accounts.generatePrivateKey, privateKeyToAccount: accounts.privateKeyToAccount };
}
export async function loadDeps({ dataDir = process.env.HIVETRADE_DEPS_DIR, waitMs = 25000 } = {}) {
  try { return pick(await Promise.all(SPECS.map(spec => import(spec)))); }
  catch (error) { if (!dataDir) throw new Error('Dependencies missing: run npm ci in the bot kit first'); }
  const deadline = Date.now() + waitMs;
  while (!existsSync(join(dataDir, READY_MARKER)) && Date.now() < deadline) await sleep(500);
  if (!existsSync(join(dataDir, READY_MARKER))) throw new Error('Dependencies are still installing. Reconnect the hivetrade-bot server in /mcp in a minute.');
  const require = createRequire(join(dataDir, 'package.json'));
  return pick(SPECS.map(spec => require(spec)));
}
