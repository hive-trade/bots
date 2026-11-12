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
    assert.doesNotMatch(text, /wallets-auth|supported wallet setup|deploy and fund|send funds to th(e|at) (bot's )?deposit wallet|npm run wallet\b/i, file);
    assert.doesNotMatch(text, /hivetrade-docs\.vercel\.app/, file);
  }
});
test('Hermes loads the skills and AGENTS.md: no wording its scanners block', () => {
  // On these two shapes Hermes blocks the skill install, and drops the whole of
  // AGENTS.md from its context. deception_hide: "do not ... tell the user" reads
  // as hiding something; state the fact instead. read_secrets: "cat" followed,
  // on the same line, by .env or another credentials file reads as reading a
  // secret; that rule is critical for a skill, so even --force cannot install it.
  for (const file of ['skills/hivetrade-bot/SKILL.md', 'skills/hivetrade-deploy/SKILL.md', 'AGENTS.md']) {
    const text = read(file);
    assert.doesNotMatch(text, /do\s+not\s+(?:\w+\s+)*tell\s+(?:\w+\s+)*the\s+user/i, `${file}: deception_hide`);
    assert.doesNotMatch(text, /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i, `${file}: read_secrets`);
  }
});
test('the agent hard rules about .env and setup are in AGENTS.md and the skill', () => {
  assert.match(read('AGENTS.md'), /never read, cat, grep, open or print \.env/i);
  assert.match(read('skills/hivetrade-bot/SKILL.md'), /Never read, cat, grep, open or print `\.env`/);
  assert.match(read('skills/hivetrade-bot/SKILL.md'), /never run `npm run setup`/);
});
