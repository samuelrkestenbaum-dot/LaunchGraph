import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderBanner } from '../../src/cli/banner.js';
import { PHASE_1_CEILING, renderReportMd } from '../../src/cli/reportMd.js';
import { run } from '../../src/cli/run.js';
import type { Io } from '../../src/cli/io.js';
import { createScanner } from '../../src/scan/scanner.js';
import { makeEvidence, makeFinding, makeReport } from '../support/builders.js';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const FIXED = (): Date => new Date('2026-07-23T00:00:00.000Z');
const scanner = createScanner({ now: FIXED });

function scan(name: string) {
  return scanner(join(fixturesRoot, name));
}

interface Captured {
  writes: Array<{ path: string; data: string }>;
  out: string;
  err: string;
}

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

describe('renderReportMd — §11.3 human evidence package', () => {
  it('preserves redaction: contains ***REDACTED*** and never the raw fake key (broken-lg-002)', () => {
    const md = renderReportMd(scan('broken-lg-002'));
    expect(md).toContain('***REDACTED***');
    // The raw fake key literal must not survive into the human report (SEC-4).
    expect(md).not.toContain('EXAMPLEnotreal');
    // The LG-002 blocker and its evidence path are present.
    expect(md).toContain('LG-002');
    expect(md).toContain('lib/stripe.ts');
  });

  it('renders blockers before warnings', () => {
    const report = makeReport({
      findings: [
        makeFinding({
          id: 'LG-010-001',
          checkId: 'LG-010',
          title: 'Unauthenticated email domain',
          severity: 'warning',
          outcome: 'fail',
          summary: 'Warning-level defect.',
          evidence: [makeEvidence({ path: 'lib/email.ts', excerpt: "from: 'onboarding@resend.dev'" })],
        }),
        makeFinding({
          id: 'LG-004-001',
          checkId: 'LG-004',
          title: 'Missing webhook signature verification',
          severity: 'blocker',
          outcome: 'fail',
          summary: 'Blocker-level defect.',
          evidence: [makeEvidence({ path: 'app/api/webhook/route.ts' })],
        }),
      ],
      decision: { value: 'not_ready', reasons: ['Rule 2: confirmed blocker failure(s): LG-004-001 → not_ready.'] },
      counts: { blockers: 1, warnings: 1, unknowns: 0 },
    });
    const md = renderReportMd(report);
    const blockerHeading = md.indexOf('## Blockers');
    const warningHeading = md.indexOf('## Warnings');
    const blockerFinding = md.indexOf('LG-004');
    const warningFinding = md.indexOf('LG-010');
    expect(blockerHeading).toBeGreaterThanOrEqual(0);
    expect(warningHeading).toBeGreaterThan(blockerHeading);
    expect(blockerFinding).toBeLessThan(warningFinding);
  });

  it('states the §7 Phase-1 ceiling wherever external verification pends (broken-lg-010)', () => {
    const report = scan('broken-lg-010');
    // Precondition: this fixture carries a pending external verification.
    expect(report.findings.some((f) => f.externalVerification !== undefined)).toBe(true);
    const md = renderReportMd(report);
    expect(md).toContain(PHASE_1_CEILING);
    expect(md).toContain('External verification (Phase 3)');
    expect(md).toContain('resend');
  });

  it('renders the not_evaluated decision for an unsupported stack', () => {
    const md = renderReportMd(scan('unsupported'));
    expect(md).toContain('NOT EVALUATED (unsupported stack)');
  });

  it('AT-23: report.md is byte-identical across two fixed-clock renders', () => {
    const a = renderReportMd(scan('broken-lg-002'));
    const b = renderReportMd(scan('broken-lg-002'));
    expect(a).toBe(b);
  });
});

describe('renderBanner — §11.2 terminal banner', () => {
  it('leads with the decision line and lists blockers before warnings', () => {
    const banner = renderBanner(
      makeReport({
        stack: [{ provider: 'nextjs', signals: ['dependency:next'], support: 'fully_supported' }],
        findings: [
          makeFinding({ id: 'LG-010-001', checkId: 'LG-010', severity: 'warning', outcome: 'fail', summary: 'w' }),
          makeFinding({ id: 'LG-004-001', checkId: 'LG-004', severity: 'blocker', outcome: 'fail', summary: 'b' }),
        ],
        decision: { value: 'not_ready', reasons: [] },
        counts: { blockers: 1, warnings: 1, unknowns: 0 },
      }),
    );
    expect(banner).toContain('NOT READY');
    expect(banner.indexOf('BLOCKER')).toBeLessThan(banner.indexOf('WARNING'));
  });

  it('preserves redaction and never leaks the raw key (broken-lg-002)', () => {
    const banner = renderBanner(scan('broken-lg-002'));
    expect(banner).not.toContain('EXAMPLEnotreal');
  });
});

describe('run() — scan default mode emits report.md (Commit 2)', () => {
  it('writes both report.json and report.md and prints the banner', () => {
    const { io, cap } = fakeIo();
    run(['scan', join(fixturesRoot, 'broken-lg-002'), '--out', '/tmp/lg-c2-out'], io);
    expect(cap.writes.some((w) => w.path.endsWith('report.json'))).toBe(true);
    const md = cap.writes.find((w) => w.path.endsWith('report.md'));
    expect(md).toBeDefined();
    expect(md!.data).toContain('***REDACTED***');
    expect(md!.data).not.toContain('EXAMPLEnotreal');
    expect(cap.out).toContain('SugarBee.ai scan');
  });

  it('AT-23: report.md written by two fixed-clock runs is byte-identical', () => {
    const a = fakeIo();
    run(['scan', join(fixturesRoot, 'broken-lg-010'), '--out', '/tmp/lg-c2-a'], a.io);
    const b = fakeIo();
    run(['scan', join(fixturesRoot, 'broken-lg-010'), '--out', '/tmp/lg-c2-b'], b.io);
    const mdA = a.cap.writes.find((w) => w.path.endsWith('report.md'))!.data;
    const mdB = b.cap.writes.find((w) => w.path.endsWith('report.md'))!.data;
    expect(mdA).toBe(mdB);
  });
});

describe('run() — eval command (§9 harness)', () => {
  it('exits 0 today: every fixture decision correct, zero blocker false positives', () => {
    const { io, cap } = fakeIo();
    const code = run(['eval'], io);
    expect(code).toBe(0);
    expect(cap.out).toContain('PASS');
    expect(cap.out).toContain('Blocker false positives: 0');
  });
});
