/**
 * Test helper: materialize an inert synthetic repository in a temp dir and
 * collect it into a `Fileset`. Mirrors the `mkdtempSync` convention used by
 * the S1 suites (sec1.test.ts, harness.test.ts).
 *
 * Not a test file — the vitest include pattern only picks up
 * `tests/**\/*.test.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collect } from '../../src/scan/collect.js';
import type { Fileset } from '../../src/scan/collect.js';

export interface TempRepo {
  root: string;
  fileset: Fileset;
}

const created: string[] = [];

/** Writes `files` (repo-relative path → contents) into a fresh temp repo. */
export function makeRepo(files: Record<string, string>): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'launchgraph-repo-'));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return { root, fileset: collect(root) };
}

/** Removes every temp repo created in this test file. Call from `afterAll`. */
export function cleanupRepos(): void {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
}
