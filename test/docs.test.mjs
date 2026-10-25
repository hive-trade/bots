// Guards for beginner-facing text that the setup depends on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the README prompt asks for the market, keeps the key with the person, and forbids strategy advice', () => {
  // Must stay identical to the HiveTrade docs prompt (docs.hivetrade.com/run-a-bot/one-prompt).
  const prompt = read('README.md').match(/```text\n(Set up my own HiveTrade bot[\s\S]*?)```/)[1];
  for (const phrase of ['my own trading\n   rule in my own words', 'the exact market it trades', 'I will run it myself', 'Never run it yourself, never\n   open .env',
    'Implement exactly my rule', 'decision trace', 'Do not suggest, rank or improve strategies or markets', 'Never turn on real trading unless I clearly ask you to.']) {
    assert.ok(prompt.includes(phrase), phrase);
  }
});
test('no doc tells anyone to tick an agreement, import the key into a wallet, or sign in to Polymarket as the bot', () => {
  for (const file of ['README.md', 'AGENTS.md', 'docs/agent-setup.md', 'skills/hivetrade-bot/SKILL.md', 'skills/hivetrade-deploy/SKILL.md', 'docs/railway.md', 'mcp/tools.mjs']) {
    const text = read(file);
    assert.doesNotMatch(text, /tick (the )?(captain )?agreement/i, file);
    assert.doesNotMatch(text, /wallets-auth|supported wallet setup|deploy and fund/i, file);
    assert.doesNotMatch(text, /hivetrade-docs\.vercel\.app/, file);
  }
});
test('the agent hard rules about .env and setup are in AGENTS.md and the skill', () => {
  assert.match(read('AGENTS.md'), /never read, cat, grep, open or print \.env/i);
  assert.match(read('skills/hivetrade-bot/SKILL.md'), /Never read, cat, grep, open or print `\.env`/);
  assert.match(read('skills/hivetrade-bot/SKILL.md'), /never run `npm run setup`/);
});
