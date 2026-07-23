import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  discoverFixtures,
  evaluateFixture,
  exitCodeForDecision,
  loadExpectation,
  runEvaluation,
  type ScannerFn,
} from '../src/eval/harness.js';
import type { Report } from '../src/schema/index.js';
import { makeFinding, makeReport } from './support/builders.js';

const realFixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Synthetic fixture roots created per test; removed afterwards. */
const tempRoots: string[] = [];
afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

function makeFixturesRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'launchgraph-harness-'));
  tempRoots.push(root);
  return root;
}

function writeFixture(root: string, name: string, expectation: unknown): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'expected.json'), `${JSON.stringify(expectation, null, 2)}\n`);
  return dir;
}

const brokenExpectation = {
  decision: 'not_ready',
  exitCode: 1,
  findings: [{ checkId: 'LG-004', outcome: 'fail', evidencePathContains: ['webhook'] }],
};
const cleanExpectation = { decision: 'ready_with_warnings', exitCode: 0, findings: [] };

const lg004Report = (): Report =>
  makeReport({
    findings: [makeFinding()],
    decision: { value: 'not_ready', reasons: ['Rule 2: confirmed blocker failure: LG-004-001 → not_ready.'] },
    counts: { blockers: 1, warnings: 0, unknowns: 0 },
  });
const cleanReport = (): Report =>
  makeReport({
    decision: { value: 'ready_with_warnings', reasons: ['Rule 6: 1 pending external verification(s) → ready_with_warnings.'] },
  });

/** A scanner that produces exactly what each synthetic fixture expects. */
const perfectScanner: ScannerFn = (fixtureDir) => (fixtureDir.includes('broken') ? lg004Report() : cleanReport());

describe('exitCodeForDecision (§11.4)', () => {
  it('maps decisions to CLI exit codes', () => {
    expect(exitCodeForDecision('ready')).toBe(0);
    expect(exitCodeForDecision('ready_with_warnings')).toBe(0);
    expect(exitCodeForDecision('not_ready')).toBe(1);
    expect(exitCodeForDecision('not_evaluated')).toBe(3);
  });
});

describe('fixture discovery and manifest loading', () => {
  it('discovers the real unsupported/ fixture with its manifest', () => {
    const fixtures = discoverFixtures(realFixturesRoot);
    const unsupported = fixtures.find((f) => f.name === 'unsupported');
    expect(unsupported).toBeDefined();
    expect(unsupported?.expectation).toEqual({ decision: 'not_evaluated', exitCode: 3, findings: [] });
  });

  it('rejects a manifest with an invalid decision', () => {
    const root = makeFixturesRoot();
    const dir = writeFixture(root, 'bad-decision', { decision: 'perhaps', exitCode: 0, findings: [] });
    expect(() => loadExpectation(dir)).toThrowError(/decision/);
  });

  it('rejects a manifest with a malformed findings entry', () => {
    const root = makeFixturesRoot();
    const dir = writeFixture(root, 'bad-finding', {
      decision: 'ready',
      exitCode: 0,
      findings: [{ checkId: 'LG-004', outcome: 'exploded' }],
    });
    expect(() => loadExpectation(dir)).toThrowError(/outcome/);
  });

  it('rejects a fixture directory without expected.json', () => {
    const root = makeFixturesRoot();
    mkdirSync(join(root, 'no-manifest'));
    expect(() => loadExpectation(join(root, 'no-manifest'))).toThrowError(/expected\.json/);
  });
});

describe('evaluation — perfect scanner', () => {
  it('scores 100% on decision correctness, precision, and recall', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'broken-lg-004', brokenExpectation);
    writeFixture(root, 'clean', cleanExpectation);

    const summary = runEvaluation(root, perfectScanner);
    expect(summary.fixtureCount).toBe(2);
    expect(summary.decisionsCorrect).toBe(2);
    expect(summary.allDecisionsCorrect).toBe(true);
    expect(summary.blockerFalsePositives).toBe(0);

    const lg004 = summary.perCheck.find((m) => m.checkId === 'LG-004');
    expect(lg004).toEqual({ checkId: 'LG-004', truePositives: 1, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1 });

    for (const result of summary.results) {
      expect(result.scanError).toBeNull();
      expect(result.reportValid).toBe(true);
      expect(result.decisionCorrect).toBe(true);
      expect(result.exitCodeCorrect).toBe(true);
      expect(result.missed).toEqual([]);
      expect(result.spurious).toEqual([]);
    }
  });

  it('scores the real unsupported/ fixture with an honest-refusal scanner', () => {
    const refusalScanner: ScannerFn = () =>
      makeReport({ decision: { value: 'not_evaluated', reasons: ['Rule 1: unsupported stack — decision not_evaluated; checks were not run.'] } });
    const summary = runEvaluation(realFixturesRoot, refusalScanner);
    expect(summary.fixtureCount).toBeGreaterThanOrEqual(1);
    expect(summary.allDecisionsCorrect).toBe(true);
    expect(summary.blockerFalsePositives).toBe(0);
    const unsupported = summary.results.find((r) => r.name === 'unsupported');
    expect(unsupported?.actualExitCode).toBe(3);
    expect(unsupported?.exitCodeCorrect).toBe(true);
  });
});

describe('evaluation — degraded scanners', () => {
  it('a missed finding drops recall and the decision goes incorrect', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'broken-lg-004', brokenExpectation);
    const blindScanner: ScannerFn = () => cleanReport();

    const summary = runEvaluation(root, blindScanner);
    expect(summary.decisionsCorrect).toBe(0);
    expect(summary.allDecisionsCorrect).toBe(false);
    const lg004 = summary.perCheck.find((m) => m.checkId === 'LG-004');
    expect(lg004?.recall).toBe(0);
    expect(lg004?.falseNegatives).toBe(1);
    expect(summary.results[0]?.missed).toEqual(brokenExpectation.findings);
  });

  it('a spurious blocker on a clean fixture counts as a blocker false positive', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'clean', cleanExpectation);
    const triggerHappyScanner: ScannerFn = () =>
      makeReport({
        findings: [makeFinding({ id: 'LG-002-001', checkId: 'LG-002', title: 'Stripe test/live key mixing' })],
        decision: { value: 'ready_with_warnings', reasons: ['Rule 6: 1 warning(s) → ready_with_warnings.'] },
        counts: { blockers: 1, warnings: 0, unknowns: 0 },
      });

    const summary = runEvaluation(root, triggerHappyScanner);
    expect(summary.blockerFalsePositives).toBe(1);
    const lg002 = summary.perCheck.find((m) => m.checkId === 'LG-002');
    expect(lg002?.precision).toBe(0);
    expect(lg002?.falsePositives).toBe(1);
    expect(summary.results[0]?.spurious).toHaveLength(1);
  });

  it('a wrong decision is reported as incorrect with the wrong exit code', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'clean', cleanExpectation);
    const pessimistScanner: ScannerFn = () =>
      makeReport({ decision: { value: 'not_ready', reasons: ['Rule 2: confirmed blocker failure: LG-004-001 → not_ready.'] } });

    const result = evaluateFixture(discoverFixtures(root)[0]!, pessimistScanner);
    expect(result.decisionCorrect).toBe(false);
    expect(result.actualExitCode).toBe(1);
    expect(result.exitCodeCorrect).toBe(false);
  });

  it('an evidence-path mismatch fails the match (finding counted missed and spurious)', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'broken-lg-004', brokenExpectation);
    const wrongFileScanner: ScannerFn = () =>
      makeReport({
        findings: [makeFinding({ evidence: [{ path: 'src/other.ts', startLine: 1, endLine: 2, excerpt: 'x', kind: 'code' }] })],
        decision: { value: 'not_ready', reasons: ['Rule 2: confirmed blocker failure: LG-004-001 → not_ready.'] },
        counts: { blockers: 1, warnings: 0, unknowns: 0 },
      });

    const summary = runEvaluation(root, wrongFileScanner);
    const lg004 = summary.perCheck.find((m) => m.checkId === 'LG-004');
    expect(lg004?.truePositives).toBe(0);
    expect(lg004?.falseNegatives).toBe(1);
    expect(lg004?.falsePositives).toBe(1);
    expect(summary.results[0]?.decisionCorrect).toBe(true);
  });

  it('a throwing scanner records a scan error with exit code 2', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'clean', cleanExpectation);
    const crashingScanner: ScannerFn = () => {
      throw new Error('parse explosion');
    };

    const result = evaluateFixture(discoverFixtures(root)[0]!, crashingScanner);
    expect(result.scanError).toContain('parse explosion');
    expect(result.actualExitCode).toBe(2);
    expect(result.actualDecision).toBeNull();
    expect(result.decisionCorrect).toBe(false);
    expect(result.reportValid).toBe(false);
  });

  it('a schema-invalid report is flagged by the harness (AT-25 groundwork)', () => {
    const root = makeFixturesRoot();
    writeFixture(root, 'clean', cleanExpectation);
    const invalidScanner: ScannerFn = () => {
      const report = cleanReport();
      report.findings.push(makeFinding({ evidence: [] })); // fail finding without evidence
      return report;
    };

    const result = evaluateFixture(discoverFixtures(root)[0]!, invalidScanner);
    expect(result.reportValid).toBe(false);
    expect(result.reportErrors.some((e) => e.includes('evidence'))).toBe(true);
  });
});
