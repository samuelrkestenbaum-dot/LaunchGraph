import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverFixtures, runEvaluation } from '../../src/eval/harness.js';
import { serializeReport } from '../../src/report/serialize.js';
import { createScanner } from '../../src/scan/scanner.js';
import { validateReport } from '../../src/schema/index.js';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

/** Fixed clock so serialized output is comparable (AT-23). */
const FIXED = (): Date => new Date('2026-07-23T00:00:00.000Z');
const scanner = createScanner({ now: FIXED });

const BROKEN: ReadonlyArray<readonly [string, string]> = [
  ['broken-lg-001', 'LG-001'],
  ['broken-lg-002', 'LG-002'],
  ['broken-lg-003', 'LG-003'],
  ['broken-lg-004', 'LG-004'],
  ['broken-lg-008', 'LG-008'],
  ['broken-lg-015', 'LG-015'],
];

/**
 * Warning-ceiling external detectors (LG-010/LG-014). Their seeded repo
 * problems surface as outcome `fail` + severity `warning`, so — unlike the
 * BROKEN blocker fixtures — each reaches `ready_with_warnings` (exit 0), NOT
 * `not_ready`, and must NEVER be counted as a blocker false positive. Kept in
 * a separate list precisely so the blocker-only assertions above stay valid.
 */
const WARNING_CEILING: ReadonlyArray<{ fixture: string; checkId: string; pathContains: string }> = [
  { fixture: 'broken-lg-010', checkId: 'LG-010', pathContains: 'email' },
  { fixture: 'broken-lg-014', checkId: 'LG-014', pathContains: 'sentry.server.config' },
];

describe('scanner — §9 harness integration over real fixtures', () => {
  it('scores every fixture correctly with zero blocker false positives (AT-01/02/03/04/08/15, AT-25)', () => {
    const summary = runEvaluation(fixturesRoot, scanner);

    for (const r of summary.results) {
      expect(r.reportValid, `${r.name} invalid: ${r.reportErrors.join('; ')}`).toBe(true);
      expect(r.scanError, `${r.name} scan error`).toBeNull();
      expect(r.missed, `${r.name} missed findings`).toEqual([]);
      expect(r.decisionCorrect, `${r.name} decision wrong: ${String(r.actualDecision)}`).toBe(true);
      expect(r.exitCodeCorrect, `${r.name} exit wrong`).toBe(true);
    }
    // Each seeded check recalls exactly its defect.
    for (const [, id] of BROKEN) {
      const metric = summary.perCheck.find((m) => m.checkId === id);
      expect(metric?.truePositives, `${id} tp`).toBe(1);
      expect(metric?.recall, `${id} recall`).toBe(1);
    }
    // Blocker false positives across ALL fixtures (incl. clean-min) = 0.
    expect(summary.blockerFalsePositives).toBe(0);
  });

  it('emits exactly one confirmed blocker fail per broken fixture, with the right id (AT-03/08/15)', () => {
    for (const [name, id] of BROKEN) {
      const report = scanner(join(fixturesRoot, name));
      const blockerFails = report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail');
      expect(blockerFails.map((f) => f.checkId), name).toEqual([id]);
      expect(blockerFails[0]?.classification).toBe('confirmed');
      expect(blockerFails[0]?.confidence).toBe(1);
      expect(report.decision.value, name).toBe('not_ready');
    }
  });

  it('the seeded LG-003 fail carries a documentary externalVerification{stripe}', () => {
    const report = scanner(join(fixturesRoot, 'broken-lg-003'));
    const lg003 = report.findings.find((f) => f.checkId === 'LG-003');
    expect(lg003?.outcome).toBe('fail');
    expect(lg003?.classification).toBe('confirmed');
    expect(lg003?.externalVerification?.provider).toBe('stripe');
    expect(lg003?.externalVerification?.phase).toBe('phase-3');
  });

  it('the confirmed LG-008 fail carries NO externalVerification and drives not_ready', () => {
    const report = scanner(join(fixturesRoot, 'broken-lg-008'));
    const lg008 = report.findings.find((f) => f.checkId === 'LG-008');
    expect(lg008?.outcome).toBe('fail');
    expect(lg008?.classification).toBe('confirmed');
    // Repo-provable mixing is confirmed — no external half.
    expect(lg008?.externalVerification).toBeUndefined();
    expect(report.decision.value).toBe('not_ready');
  });

  it('holds the Phase-1 ceiling at ready_with_warnings for clean-min (LG-015 pass-unverified), NOT ready', () => {
    const report = scanner(join(fixturesRoot, 'clean-min'));
    const lg015 = report.findings.find((f) => f.checkId === 'LG-015');
    expect(lg015?.outcome).toBe('pass');
    expect(lg015?.classification).toBe('unverified');
    expect(lg015?.externalVerification?.provider).toBe('dns');
    expect(lg015?.externalVerification?.phase).toBe('phase-3');
    // Zero blockers, but a pending external verification holds the ceiling (§7 rule 6).
    expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail')).toEqual([]);
    expect(report.counts.blockers).toBe(0);
    expect(report.decision.value).toBe('ready_with_warnings');
    expect(report.decision.value).not.toBe('ready');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('validates every fixture report and carries evidence on every fail/warning finding (AT-25, AT-26)', () => {
    for (const fixture of discoverFixtures(fixturesRoot)) {
      const report = scanner(fixture.dir);
      expect(validateReport(report).errors, fixture.name).toEqual([]);
      for (const f of report.findings) {
        if (f.outcome === 'fail' || f.outcome === 'warning') {
          expect(f.evidence.length, `${fixture.name} ${f.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('recalls each warning-ceiling defect as fail+warning at ready_with_warnings, no blocker FP (AT-10/AT-14)', () => {
    const summary = runEvaluation(fixturesRoot, scanner);
    for (const { fixture, checkId, pathContains } of WARNING_CEILING) {
      const result = summary.results.find((r) => r.name === fixture);
      expect(result, fixture).toBeDefined();
      // The seeded finding is recalled (true positive), decision + exit correct.
      expect(result?.missed, `${fixture} missed`).toEqual([]);
      expect(result?.decisionCorrect, `${fixture} decision ${String(result?.actualDecision)}`).toBe(true);
      expect(result?.actualDecision, fixture).toBe('ready_with_warnings');
      expect(result?.actualExitCode, fixture).toBe(0);
      expect(result?.exitCodeCorrect, fixture).toBe(true);
      // No blocker false positive is introduced by a warning-ceiling fixture.
      expect(result?.blockerFalsePositives, fixture).toBe(0);
      const metric = summary.perCheck.find((m) => m.checkId === checkId);
      expect(metric?.truePositives, `${checkId} tp`).toBe(1);
      expect(metric?.recall, `${checkId} recall`).toBe(1);
      expect(metric?.falsePositives, `${checkId} fp`).toBe(0);
      // The finding is a fail carrying severity 'warning' and cites the seeded file.
      const report = scanner(join(fixturesRoot, fixture));
      const finding = report.findings.find((f) => f.checkId === checkId);
      expect(finding?.outcome, fixture).toBe('fail');
      expect(finding?.severity, fixture).toBe('warning');
      expect(finding?.evidence.some((e) => e.path.includes(pathContains)), fixture).toBe(true);
      // A warning-ceiling fail is NEVER a blocker fail.
      expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail'), fixture).toEqual([]);
    }
    expect(summary.blockerFalsePositives).toBe(0);
  });

  it('broken-lg-010 holds the ceiling at ready_with_warnings with the LG-010 external marker (AT-10)', () => {
    const report = scanner(join(fixturesRoot, 'broken-lg-010'));
    const lg010 = report.findings.find((f) => f.checkId === 'LG-010');
    expect(lg010?.outcome).toBe('fail');
    expect(lg010?.severity).toBe('warning');
    expect(lg010?.classification).toBe('confirmed');
    expect(lg010?.externalVerification?.provider).toBe('resend');
    expect(lg010?.externalVerification?.phase).toBe('phase-3');
    expect(report.counts.blockers).toBe(0);
    expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail')).toEqual([]);
    expect(report.decision.value).toBe('ready_with_warnings');
    expect(report.decision.value).not.toBe('ready');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('broken-lg-014 holds the ceiling at ready_with_warnings with the LG-014 external marker (AT-14)', () => {
    const report = scanner(join(fixturesRoot, 'broken-lg-014'));
    const lg014 = report.findings.find((f) => f.checkId === 'LG-014');
    expect(lg014?.outcome).toBe('fail');
    expect(lg014?.severity).toBe('warning');
    expect(lg014?.classification).toBe('confirmed');
    expect(lg014?.externalVerification?.provider).toBe('sentry');
    expect(lg014?.externalVerification?.phase).toBe('phase-3');
    expect(report.counts.blockers).toBe(0);
    expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail')).toEqual([]);
    expect(report.decision.value).toBe('ready_with_warnings');
    expect(report.decision.value).not.toBe('ready');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('produces byte-identical serialized reports across two fixed-clock runs (AT-23)', () => {
    for (const [name] of BROKEN) {
      const dir = join(fixturesRoot, name);
      expect(serializeReport(scanner(dir)), name).toBe(serializeReport(scanner(dir)));
    }
    for (const { fixture } of WARNING_CEILING) {
      const dir = join(fixturesRoot, fixture);
      expect(serializeReport(scanner(dir)), fixture).toBe(serializeReport(scanner(dir)));
    }
    const cleanDir = join(fixturesRoot, 'clean-min');
    expect(serializeReport(scanner(cleanDir))).toBe(serializeReport(scanner(cleanDir)));
  });

  it('redacts the seeded fake live key — the raw secret appears nowhere (AT-20 groundwork)', () => {
    const report = scanner(join(fixturesRoot, 'broken-lg-002'));
    const serialized = serializeReport(report);
    expect(serialized).not.toContain('EXAMPLEnotreal');
    expect(serialized).toContain('***REDACTED***');
    const lg002 = report.findings.find((f) => f.checkId === 'LG-002');
    expect(lg002?.outcome).toBe('fail');
    expect(lg002?.evidence.some((e) => e.path === 'lib/stripe.ts')).toBe(true);
  });
});
