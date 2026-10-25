import { existsSync } from 'node:fs';
import { join } from 'node:path';
// An error whose message the kit wrote itself and that holds no secret: it
// names a setting or a public fact. Only these are printed. Every other error
// is hidden, because SDK and gateway errors can carry credentials.
export class SafeError extends Error {}
const KEY_LIKE = /0x[0-9a-fA-F]{64}/g;
const redact = text => String(text).replace(KEY_LIKE, '[hidden]');
// One line for the terminal. Mentions the journal or lock only when they
// exist, so a first dry run never talks about trades that were never sent.
export function stopMessage(stage, error, { stateDir = './state', strategyStage = false } = {}) {
  const parts = [`Stopped during ${stage}.`];
  if (error instanceof SafeError) parts.push(redact(error.message));
  else if (strategyStage && error instanceof Error) parts.push(`Your strategy threw an error: ${redact(error.message).slice(0, 300)}`);
  else parts.push('Details are hidden because they can contain credentials.');
  if (existsSync(join(stateDir, 'runner.lock'))) parts.push(`${join(stateDir, 'runner.lock')} exists: another run is in progress, or a run stopped without cleaning up. Make sure no run is going and reconcile any trade before removing it (docs/recovery.md).`);
  else if (existsSync(join(stateDir, 'journal.json'))) parts.push(`If a trade may have been sent, reconcile ${join(stateDir, 'journal.json')} with the venue before restarting (docs/recovery.md).`);
  return parts.join(' ');
}
