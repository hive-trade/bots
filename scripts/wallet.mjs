// npm run wallet: print this bot's Polymarket deposit wallet, the address to
// fund. HiveTrade creates it with the Hive. Read with requests signed by the
// bot's key; prints no secret and changes nothing.
import { callTool } from '../mcp/tools.mjs';
const result = await callTool('get_bot_status', {}, { dir: process.cwd() });
const text = result.content.map(c => c.text).join('\n');
if (result.isError) { console.error(text); process.exitCode = 1; }
else {
  const status = JSON.parse(text);
  if (!status.found) { console.error(status.message); process.exitCode = 1; }
  else if (status.venue && status.venue !== 'polymarket') console.log('This is a Kalshi Hive: there is no deposit wallet to fund. Connect your Kalshi API key in HiveTrade Settings.');
  else if (status.depositWallet) console.log(`Deposit wallet (send funds here): ${status.depositWallet}\n${status.depositWalletNote}`);
  else console.log(status.depositWalletNote);
}
