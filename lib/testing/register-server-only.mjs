// node:test loads `server-only` through the default export, which throws.
// Register before the test files import Prisma or server env helpers.
import { registerHooks } from 'node:module';

const stubUrl = new URL('./server-only-stub.mjs', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { shortCircuit: true, url: stubUrl };
    }
    return nextResolve(specifier, context);
  },
});
