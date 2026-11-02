// Loaded with `node --import`: makes bot.mjs import test-support/strategy.mjs
// in place of the person's strategy.mjs. Kit tests must not depend on the rule.
import { registerHooks } from 'node:module';
const fixture = new URL('./strategy.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './strategy.mjs' && context.parentURL?.endsWith('/bot.mjs')) return { url: fixture, shortCircuit: true };
    return next(specifier, context);
  },
});
