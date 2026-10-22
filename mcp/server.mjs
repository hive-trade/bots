#!/usr/bin/env node
// HiveTrade bot kit MCP server (stdio). Runs on the person's computer next to
// the bot's .env: HIVETRADE_BOT_DIR, else the Claude Code project folder, else
// the current directory. No tool posts Calls, enables live trading, moves
// money or reads an account credential; see mcp/tools.mjs.
import { readFileSync } from 'node:fs';
import { loadDeps } from './deps.mjs';
import { TOOLS, callTool, botDir } from './tools.mjs';

const deps = await loadDeps().catch(error => { console.error(error.message); process.exit(1); });
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = new deps.Server({ name: 'hivetrade-bot', version }, { capabilities: { tools: {} },
  instructions: 'Set up the person\'s own HiveTrade bot. Follow skills/hivetrade-bot/SKILL.md. Never ask for or display a private key; the person creates the Hive and decides on live trading.' });
server.setRequestHandler(deps.ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));
server.setRequestHandler(deps.CallToolRequestSchema, async request =>
  callTool(request.params.name, request.params.arguments, { dir: botDir(), deps }));
await server.connect(new deps.StdioServerTransport());
