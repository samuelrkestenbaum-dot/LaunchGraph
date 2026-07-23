import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { collect } from '../../src/scan/collect.js';

/** Temp dirs created per test; removed afterwards. */
const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'launchgraph-collect-'));
  tempDirs.push(dir);
  return dir;
}

function write(root: string, rel: string, content: string | Buffer): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

describe('collect — SEC-6 containment traversal', () => {
  it('returns a deterministic, sorted fileset with repo-relative POSIX paths', () => {
    const root = makeTempDir();
    write(root, 'b.ts', 'export const b = 1;\n');
    write(root, 'a/c.ts', 'export const c = 2;\n');
    write(root, 'a/a.ts', 'export const a = 3;\n');

    const first = collect(root);
    const second = collect(root);
    expect(first.files.map((f) => f.path)).toEqual(['a/a.ts', 'a/c.ts', 'b.ts']);
    expect(first.files.map((f) => f.path)).toEqual(second.files.map((f) => f.path));
    expect(first.files[0]?.content).toBe('export const a = 3;\n');
    expect(first.truncated).toBe(false);
    expect(first.degradations).toEqual([]);
  });

  it('rejects a symlink that escapes the repo root (SEC-6) and records it', () => {
    const outside = makeTempDir();
    write(outside, 'secret.txt', 'outside the repo\n');
    const root = makeTempDir();
    write(root, 'inside.ts', 'export const x = 1;\n');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'));

    const result = collect(root);
    expect(result.files.map((f) => f.path)).toEqual(['inside.ts']);
    expect(result.files.some((f) => f.content.includes('outside the repo'))).toBe(false);
    const escape = result.degradations.find((d) => d.reason === 'symlink_escape');
    expect(escape).toBeDefined();
    expect(escape?.path).toBe('escape.txt');
    expect(result.truncated).toBe(true);
  });

  it('skips binary files and records the skip (SEC-7)', () => {
    const root = makeTempDir();
    write(root, 'app.ts', 'export const ok = true;\n');
    write(root, 'logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]));

    const result = collect(root);
    expect(result.files.map((f) => f.path)).toEqual(['app.ts']);
    const binary = result.degradations.find((d) => d.reason === 'binary');
    expect(binary?.path).toBe('logo.png');
  });

  it('enforces the per-file byte cap and records too_large (SEC-6)', () => {
    const root = makeTempDir();
    write(root, 'small.ts', 'x\n');
    write(root, 'big.ts', 'y'.repeat(64));

    const result = collect(root, { maxFileBytes: 10 });
    expect(result.files.map((f) => f.path)).toEqual(['small.ts']);
    const tooLarge = result.degradations.find((d) => d.reason === 'too_large');
    expect(tooLarge?.path).toBe('big.ts');
  });

  it('enforces the per-repo file-count cap and records file_cap_exceeded (SEC-6)', () => {
    const root = makeTempDir();
    write(root, 'a.ts', '1\n');
    write(root, 'b.ts', '2\n');
    write(root, 'c.ts', '3\n');

    const result = collect(root, { maxFiles: 1 });
    expect(result.files).toHaveLength(1);
    const cap = result.degradations.find((d) => d.reason === 'file_cap_exceeded');
    expect(cap).toBeDefined();
    expect(result.truncated).toBe(true);
  });

  it('enforces the overall traversal budget and records it (SEC-6/7)', () => {
    const root = makeTempDir();
    for (const name of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) write(root, name, 'x\n');

    const result = collect(root, { traversalBudget: 2 });
    const budget = result.degradations.find((d) => d.reason === 'traversal_budget_exceeded');
    expect(budget).toBeDefined();
    expect(result.truncated).toBe(true);
  });

  it('excludes .git and node_modules without treating them as degradations', () => {
    const root = makeTempDir();
    write(root, 'src/app.ts', 'export const a = 1;\n');
    write(root, 'node_modules/dep/index.js', 'module.exports = {};\n');
    write(root, '.git/config', '[core]\n');

    const result = collect(root);
    expect(result.files.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(result.degradations).toEqual([]);
  });
});
