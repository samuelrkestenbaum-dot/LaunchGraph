import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = join(repoRoot, 'fixtures');

/** Every fixture directory that ships a package.json, sorted by name. */
function fixturePackageJsons(): Array<{ name: string; pkg: Record<string, unknown> }> {
  return readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .filter((name) => existsSync(join(fixturesRoot, name, 'package.json')))
    .map((name) => ({
      name,
      pkg: JSON.parse(readFileSync(join(fixturesRoot, name, 'package.json'), 'utf8')) as Record<string, unknown>,
    }));
}

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

  it('every fixture package.json is inert data: no scripts, no workspaces, private:true', () => {
    const fixtures = fixturePackageJsons();
    // Guard against silently testing nothing if fixtures move.
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
    for (const { name, pkg } of fixtures) {
      expect(pkg['scripts'], `fixtures/${name} must declare no scripts`).toBeUndefined();
      expect(pkg['workspaces'], `fixtures/${name} must declare no workspaces`).toBeUndefined();
      expect(pkg['private'], `fixtures/${name} must be private`).toBe(true);
    }
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
