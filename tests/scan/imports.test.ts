import { afterAll, describe, expect, it } from 'vitest';

import { hasLocalRuntimeImport, isLocalSpecifier, topLevelDirectories } from '../../src/scan/imports.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

/** A fixed top-level-dir set for the predicate-level tests. */
const DIRS: ReadonlySet<string> = new Set(['app', 'lib']);

describe('H-003 C1 — isLocalSpecifier locality classes', () => {
  it('classifies relative specifiers as local (./ and ../)', () => {
    expect(isLocalSpecifier('./events', DIRS)).toBe(true);
    expect(isLocalSpecifier('../lib/events', DIRS)).toBe(true);
  });

  it('classifies root aliases as local (@/ and ~/)', () => {
    expect(isLocalSpecifier('@/lib/events', DIRS)).toBe(true);
    expect(isLocalSpecifier('~/lib/events', DIRS)).toBe(true);
  });

  it('classifies a baseUrl-style specifier as local iff its first segment names a top-level dir', () => {
    expect(isLocalSpecifier('lib/db', DIRS)).toBe(true);
    expect(isLocalSpecifier('app/config', DIRS)).toBe(true);
    expect(isLocalSpecifier('utils/db', DIRS)).toBe(false);
  });

  it('bare npm specifiers are NOT local — node_modules is outside the evidence universe', () => {
    expect(isLocalSpecifier('stripe', DIRS)).toBe(false);
    expect(isLocalSpecifier('server-only', DIRS)).toBe(false);
    // A scoped package is bare too — `@scope/pkg` is not the `@/` root alias.
    expect(isLocalSpecifier('@prisma/client', DIRS)).toBe(false);
  });

  it('an empty specifier and an absolute path are not in the class', () => {
    expect(isLocalSpecifier('', DIRS)).toBe(false);
    expect(isLocalSpecifier('/etc/anything', DIRS)).toBe(false);
  });
});

describe('H-003 C1 — topLevelDirectories derivation (moved from lg005.ts)', () => {
  it('collects the first path segment of every nested file and ignores root-level files', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': 'export const x = 1;\n',
      'lib/events.ts': 'export const y = 1;\n',
      'README.md': 'root-level file — names no directory\n',
    });
    const dirs = topLevelDirectories(fileset);
    expect([...dirs].sort()).toEqual(['app', 'lib']);
    expect(dirs.has('README.md')).toBe(false);
  });
});

describe('H-003 C1 — hasLocalRuntimeImport: all four statement forms arm on local specifiers', () => {
  it('arms on `import … from` with a local specifier', () => {
    expect(hasLocalRuntimeImport("import { handle } from './events';\n", DIRS)).toBe(true);
  });

  it('arms on `export … from` with a local specifier', () => {
    expect(hasLocalRuntimeImport("export { handle } from '../lib/events';\n", DIRS)).toBe(true);
  });

  it('arms on `require(…)` with a local specifier', () => {
    expect(hasLocalRuntimeImport("const m = require('./events');\n", DIRS)).toBe(true);
  });

  it('arms on dynamic `import(…)` with a local specifier', () => {
    expect(hasLocalRuntimeImport("const m = await import('./events');\n", DIRS)).toBe(true);
  });

  it('arms on a side-effect-only import with a local specifier', () => {
    expect(hasLocalRuntimeImport("import './register-handlers';\n", DIRS)).toBe(true);
  });

  it('does NOT arm on bare npm specifiers in any form', () => {
    const bare = [
      "import Stripe from 'stripe';\n",
      "export { x } from 'stripe';\n",
      "const s = require('stripe');\n",
      "const s = await import('stripe');\n",
      "import 'server-only';\n",
    ];
    for (const content of bare) {
      expect(hasLocalRuntimeImport(content, DIRS), content).toBe(false);
    }
  });
});

describe('H-003 C1 — type-only statements are excluded', () => {
  it('`import type` with a local specifier does NOT arm', () => {
    expect(hasLocalRuntimeImport("import type { Ctx } from './types';\n", DIRS)).toBe(false);
  });

  it('`export type` with a local specifier does NOT arm', () => {
    expect(hasLocalRuntimeImport("export type { Ctx } from './types';\n", DIRS)).toBe(false);
  });

  it('a runtime import alongside a type-only one still arms', () => {
    const content = "import type { Ctx } from './types';\nimport { handle } from './events';\n";
    expect(hasLocalRuntimeImport(content, DIRS)).toBe(true);
  });
});

describe('H-003 C1 — template-literal specifiers and the interpolated-prefix classification', () => {
  it('an uninterpolated template-literal require()/import() with a local specifier arms', () => {
    expect(hasLocalRuntimeImport('const m = require(`./events`);\n', DIRS)).toBe(true);
    expect(hasLocalRuntimeImport('const m = await import(`../lib/events`);\n', DIRS)).toBe(true);
  });

  it('an INTERPOLATED template literal is classified by its static prefix — local prefix arms', () => {
    // eslint-disable-next-line no-template-curly-in-string
    expect(hasLocalRuntimeImport('const h = await import(`./handlers/${event.type}`);\n', DIRS)).toBe(true);
  });

  it('an interpolated template literal with a BARE static prefix does NOT arm', () => {
    // eslint-disable-next-line no-template-curly-in-string
    expect(hasLocalRuntimeImport('const s = await import(`stripe${suffix}`);\n', DIRS)).toBe(false);
  });
});

describe('H-003 C1 — the side-effect form is quoted-only', () => {
  it('a backtick "static import" does not arm — static import declarations accept only string literals', () => {
    // `import \`./x\`` is not valid JS/TS; the side-effect regex must not
    // treat it as a delegation site, and no other form matches it either
    // (no parenthesis, no `from` clause).
    expect(hasLocalRuntimeImport('import `./register-handlers`;\n', DIRS)).toBe(false);
  });
});
