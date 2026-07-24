import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { run } from '../../src/cli/run.js';
import type { Io } from '../../src/cli/io.js';
import { exitCodeForDecision } from '../../src/eval/harness.js';
import { serializeReport } from '../../src/report/serialize.js';
import { createScanner } from '../../src/scan/scanner.js';
import { validateReport } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

/** Fixed clock so serialized output is comparable (AT-23), mirroring scanner.test.ts. */
const FIXED = (): Date => new Date('2026-07-23T00:00:00.000Z');

interface Captured {
  writes: Array<{ path: string; data: string }>;
  out: string;
  err: string;
}

/** A fake `Io` that captures every side effect for assertion. */
function fakeIo(cwd = fixturesRoot): { io: Io; cap: Captured } {
  const cap: Captured = { writes: [], out: '', err: '' };
  const io: Io = {
    stdout: (s) => {
      cap.out += s;
    },
    stderr: (s) => {
      cap.err += s;
    },
    now: FIXED,
    cwd: () => cwd,
    writeFile: (path, data) => {
      cap.writes.push({ path, data });
    },
  };
  return { io, cap };
}

const tmpDirs: string[] = [];
function tmpOut(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lg-out-'));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  cleanupRepos();
});

/** The report.json write from a default-mode run, if any. */
function reportJsonWrite(cap: Captured): { path: string; data: string } | undefined {
  return cap.writes.find((w) => w.path.endsWith('report.json'));
}

describe('run() — scan command (§11 CLI)', () => {
  it('AT-24: unsupported stack exits 3 with not_evaluated and zero findings', () => {
    const { io, cap } = fakeIo();
    const code = run(['scan', join(fixturesRoot, 'unsupported'), '--out', tmpOut()], io);
    expect(code).toBe(3);
    const write = reportJsonWrite(cap);
    expect(write).toBeDefined();
    const parsed = JSON.parse(write!.data);
    expect(parsed.decision.value).toBe('not_evaluated');
    // §2.3/AT-24: no junk *defect* findings — the detectors that ran only
    // report `not_applicable`/`pass`, never a fail/warning, on an unsupported
    // stack (decide short-circuits to not_evaluated before any defect stands).
    const defects = (parsed.findings as Array<{ outcome: string }>).filter(
      (f) => f.outcome === 'fail' || f.outcome === 'warning',
    );
    expect(defects).toEqual([]);
  });

  it.each([
    ['broken-lg-001', 1], // confirmed blocker fail → not_ready
    ['broken-lg-010', 0], // warning-ceiling → ready_with_warnings
    ['clean-min', 0], // pass-unverified ceiling → ready_with_warnings
    ['unsupported', 3], // unsupported stack → not_evaluated
  ])('exit code for %s is %i (decision-driven)', (name, expected) => {
    const { io } = fakeIo();
    const code = run(['scan', join(fixturesRoot, name), '--out', tmpOut()], io);
    expect(code).toBe(expected);
  });

  it('--json emits the canonical serializeReport to stdout and writes no files', () => {
    const dir = join(fixturesRoot, 'broken-lg-001');
    const { io, cap } = fakeIo();
    const code = run(['scan', dir, '--json'], io);

    const expected = createScanner({ now: FIXED })(dir);
    expect(cap.out).toBe(serializeReport(expected));
    expect(cap.writes).toEqual([]);
    expect(code).toBe(exitCodeForDecision(expected.decision.value));
  });

  it('AT-25: the emitted report.json validates against the §5 schema', () => {
    const { io, cap } = fakeIo();
    run(['scan', join(fixturesRoot, 'clean-min'), '--out', tmpOut()], io);
    const parsed = JSON.parse(reportJsonWrite(cap)!.data);
    expect(validateReport(parsed).errors).toEqual([]);
  });

  it('AT-23: two fixed-clock runs write byte-identical report.json', () => {
    const dir = join(fixturesRoot, 'broken-lg-002');
    const a = fakeIo();
    run(['scan', dir, '--out', tmpOut()], a.io);
    const b = fakeIo();
    run(['scan', dir, '--out', tmpOut()], b.io);
    expect(reportJsonWrite(a.cap)!.data).toBe(reportJsonWrite(b.cap)!.data);
  });

  it('AT-27 (partial): --offline is accepted and byte-identical to a non-offline scan', () => {
    const dir = join(fixturesRoot, 'broken-lg-010');
    const offline = fakeIo();
    const offlineCode = run(['scan', dir, '--offline', '--json'], offline.io);
    const online = fakeIo();
    const onlineCode = run(['scan', dir, '--json'], online.io);
    // No model layer exists yet, so --offline changes nothing — and there is no
    // network egress in either mode (structural: the scanner performs none).
    expect(offline.cap.out).toBe(online.cap.out);
    expect(offlineCode).toBe(onlineCode);
  });

  it('--checks LG-001 restricts the findings to LG-001 only', () => {
    const dir = join(fixturesRoot, 'broken-lg-001');
    const { io, cap } = fakeIo();
    run(['scan', dir, '--checks', 'LG-001', '--json'], io);
    const parsed = JSON.parse(cap.out);
    expect(parsed.findings.length).toBeGreaterThan(0);
    for (const finding of parsed.findings) {
      expect(finding.checkId).toBe('LG-001');
    }
  });

  it('--app repoints the scan target into a monorepo sub-app', () => {
    const { root } = makeRepo({
      'package.json': JSON.stringify({ name: 'monorepo', private: true }),
      'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: { next: '14.0.0' } }),
      'apps/web/app/dashboard/page.tsx': 'export default function Page() {\n  return null;\n}\n',
    });

    const bare = fakeIo();
    run(['scan', root, '--json'], bare.io);
    const bareRoot = JSON.parse(bare.cap.out).repo.root;

    const app = fakeIo();
    run(['scan', root, '--app', 'apps/web', '--json'], app.io);
    const appRoot = JSON.parse(app.cap.out).repo.root;

    expect(appRoot).not.toBe(bareRoot);
    expect(appRoot.startsWith(bareRoot)).toBe(true);
    expect(appRoot.endsWith(join('apps', 'web'))).toBe(true);
  });

  it('SEC-6: every written file stays within the --out directory', () => {
    const out = tmpOut();
    const { io, cap } = fakeIo();
    run(['scan', join(fixturesRoot, 'broken-lg-002'), '--out', out], io);
    expect(cap.writes.length).toBeGreaterThan(0);
    for (const write of cap.writes) {
      expect(write.path === out || write.path.startsWith(out + sep)).toBe(true);
    }
  });

  it('a parse error prints to stderr and returns exit code 2, writing nothing', () => {
    const { io, cap } = fakeIo();
    const code = run(['frobnicate'], io);
    expect(code).toBe(2);
    expect(cap.err.length).toBeGreaterThan(0);
    expect(cap.writes).toEqual([]);
  });

  it('a scan error (nonexistent path) prints to stderr and returns exit code 2', () => {
    const { io, cap } = fakeIo();
    const code = run(['scan', join(fixturesRoot, 'does-not-exist-xyz'), '--out', tmpOut()], io);
    expect(code).toBe(2);
    expect(cap.err.length).toBeGreaterThan(0);
  });
});
