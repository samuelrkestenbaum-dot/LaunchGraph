import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runEvaluation } from '../../src/eval/harness.js';
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
  ['broken-lg-004', 'LG-004'],
];

describe('scanner — §9 harness integration over real fixtures', () => {
  it('scores every fixture correctly with zero blocker false positives (AT-01/02/04, AT-25)', () => {
    const summary = runEvaluation(fixturesRoot, scanner);

    for (const r of summary.results) {
      expect(r.reportValid, `${r.name} invalid: ${r.reportErrors.join('; ')}`).toBe(true);
      expect(r.scanError, `${r.name} scan error`).toBeNull();
      expect(r.missed, `${r.name} missed findings`).toEqual([]);
      expect(r.decisionCorrect, `${r.name} decision wrong: ${String(r.actualDecision)}`).toBe(true);
      expect(r.exitCodeCorrect, `${r.name} exit wrong`).toBe(true);
    }
    // AT-01/02/04: the three seeded checks each recall exactly their defect.
    for (const [, id] of BROKEN) {
      const metric = summary.perCheck.find((m) => m.checkId === id);
      expect(metric?.truePositives, `${id} tp`).toBe(1);
      expect(metric?.recall, `${id} recall`).toBe(1);
    }
    // Blocker false positives across ALL fixtures (incl. clean-min) = 0.
    expect(summary.blockerFalsePositives).toBe(0);
  });

  it('emits exactly one confirmed blocker fail per broken fixture, with the right id (AT-01/02/04)', () => {
    for (const [name, id] of BROKEN) {
      const report = scanner(join(fixturesRoot, name));
      const blockerFails = report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail');
      expect(blockerFails.map((f) => f.checkId), name).toEqual([id]);
      expect(blockerFails[0]?.classification).toBe('confirmed');
      expect(blockerFails[0]?.confidence).toBe(1);
      expect(report.decision.value, name).toBe('not_ready');
    }
  });

  it('every fail/warning finding carries non-empty evidence (AT-26)', () => {
    for (const [name] of BROKEN) {
      const report = scanner(join(fixturesRoot, name));
      const failing = report.findings.filter((f) => f.outcome === 'fail' || f.outcome === 'warning');
      expect(failing.length, name).toBeGreaterThan(0);
      for (const f of failing) {
        expect(f.evidence.length, `${name} ${f.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('produces byte-identical serialized reports across two fixed-clock runs (AT-23)', () => {
    for (const [name] of BROKEN) {
      const dir = join(fixturesRoot, name);
      expect(serializeReport(scanner(dir)), name).toBe(serializeReport(scanner(dir)));
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

  it('clean-min yields zero blocker fails and a valid subset-scoped ready (blocker FP = 0)', () => {
    const report = scanner(join(fixturesRoot, 'clean-min'));
    expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail')).toEqual([]);
    expect(report.decision.value).toBe('ready');
    expect(report.counts.blockers).toBe(0);
    expect(validateReport(report).errors).toEqual([]);
  });
});
