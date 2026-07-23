import { defineConfig } from 'vitest/config';

// SEC-1: `fixtures/` holds inert, untrusted repository data. It is never a
// workspace, never installed, never built, and never executed. The test
// runner must not pick up anything under it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['fixtures/**', 'node_modules/**'],
  },
});
