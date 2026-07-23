import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('SEC-1 — fixtures are inert data, never installed or executed', () => {
  it('root package.json declares no install/lifecycle hooks', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly']) {
      expect(scripts[hook], `root package.json must not define "${hook}"`).toBeUndefined();
    }
  });

  it('root package.json declares no workspaces (fixtures are never a workspace)', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(pkg['workspaces']).toBeUndefined();
  });

  it('the test runner excludes fixtures/**', () => {
    const config = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8');
    expect(config).toContain("exclude: ['fixtures/**'");
    expect(config).toContain("include: ['tests/**/*.test.ts']");
  });

  it('the unsupported fixture is inert data: no scripts of any kind', () => {
    const fixturePkg = JSON.parse(
      readFileSync(join(repoRoot, 'fixtures', 'unsupported', 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(fixturePkg['scripts']).toBeUndefined();
    expect(fixturePkg['private']).toBe(true);
  });

  it('the TypeScript project excludes fixtures', () => {
    const tsconfig = JSON.parse(readFileSync(join(repoRoot, 'tsconfig.json'), 'utf8')) as {
      exclude?: string[];
      include?: string[];
    };
    expect(tsconfig.exclude).toContain('fixtures');
    for (const pattern of tsconfig.include ?? []) {
      expect(pattern.startsWith('fixtures')).toBe(false);
    }
  });
});
