// npm run hive-id -- <ID>: save the Hive ID the Create page showed, without
// anyone opening .env. Writes only BOT_HIVE_ID.
import { readPublicSettings, updateEnv } from '../mcp/env-file.mjs';
const value = process.argv[2] ?? '';
const id = Number(value);
if (!Number.isSafeInteger(id) || id <= 0 || value.trim() !== String(id) || process.argv.length > 3) {
  console.error('Usage: npm run hive-id -- 4262   (the whole-number Hive ID the Create page showed)');
  process.exit(1);
}
if (!readPublicSettings('.')) { console.error('No .env yet. Run npm run setup first.'); process.exit(1); }
updateEnv('.', { BOT_HIVE_ID: String(id) });
console.log(`Saved BOT_HIVE_ID=${id} in .env.`);
