import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, validateReport } from '../src/schema/index.js';
import { makeAbsenceEvidence, makeEvidence, makeFinding, makeReport } from './support/builders.js';

function errorsOf(value: unknown): string[] {
  return validateReport(value).errors;
}

describe('SCHEMA_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof SCHEMA_VERSION).toBe('string');
    expect(SCHEMA_VERSION.length).toBeGreaterThan(0);
  });
});

describe('validateReport — structural validation', () => {
  it('accepts a minimal well-formed report', () => {
    const result = validateReport(makeReport());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts a report with valid findings and facts', () => {
    const report = makeReport({
      stack: [{ provider: 'stripe', signals: ['dependency:stripe'], support: 'fully_supported' }],
      facts: [
        {
          id: 'fact:stripe.sdk-detected',
          detector: 'dependency-manifest',
          value: { package: 'stripe', version: '14.0.0' },
          evidence: [makeEvidence({ path: 'package.json', kind: 'manifest' })],
        },
      ],
      findings: [makeFinding()],
      decision: { value: 'not_ready', reasons: ['Rule 2: confirmed blocker failure: LG-004-001 → not_ready.'] },
      counts: { blockers: 1, warnings: 0, unknowns: 0 },
    });
    expect(errorsOf(report)).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(validateReport(null).ok).toBe(false);
    expect(validateReport('report').ok).toBe(false);
    expect(validateReport(42).ok).toBe(false);
  });

  it('rejects a schemaVersion that does not match SCHEMA_VERSION', () => {
    const errors = errorsOf(makeReport({ schemaVersion: 'bogus' }));
    expect(errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects an unparseable scannedAt', () => {
    const errors = errorsOf(makeReport({ scannedAt: 'not-a-date' }));
    expect(errors.some((e) => e.includes('scannedAt'))).toBe(true);
  });

  it('rejects an invalid decision value', () => {
    const report = makeReport() as unknown as Record<string, unknown>;
    report['decision'] = { value: 'maybe_ready', reasons: [] };
    const errors = errorsOf(report);
    expect(errors.some((e) => e.includes('decision.value'))).toBe(true);
  });

  it('rejects invalid enum values on findings', () => {
    const bad = makeFinding() as unknown as Record<string, unknown>;
    bad['severity'] = 'catastrophic';
    bad['outcome'] = 'exploded';
    bad['classification'] = 'guessed';
    const errors = errorsOf(makeReport({ findings: [bad as never] }));
    expect(errors.some((e) => e.includes('severity'))).toBe(true);
    expect(errors.some((e) => e.includes('outcome'))).toBe(true);
    expect(errors.some((e) => e.includes('classification'))).toBe(true);
  });

  it('rejects an invalid stack support level', () => {
    const report = makeReport({
      stack: [{ provider: 'stripe', signals: [], support: 'best_effort' as never }],
    });
    const errors = errorsOf(report);
    expect(errors.some((e) => e.includes('support'))).toBe(true);
  });

  it('rejects negative or non-integer counts', () => {
    const errors = errorsOf(makeReport({ counts: { blockers: -1, warnings: 0.5, unknowns: 0 } }));
    expect(errors.some((e) => e.includes('counts.blockers'))).toBe(true);
    expect(errors.some((e) => e.includes('counts.warnings'))).toBe(true);
  });

  it('rejects an externalVerification with the wrong phase', () => {
    const finding = makeFinding({
      externalVerification: { provider: 'stripe', what: 'production endpoint subscribes to events', phase: 'phase-4' as never },
    });
    const errors = errorsOf(makeReport({ findings: [finding] }));
    expect(errors.some((e) => e.includes('phase'))).toBe(true);
  });

  it('accepts a valid externalVerification', () => {
    const finding = makeFinding({
      externalVerification: { provider: 'stripe', what: 'production endpoint subscribes to events', phase: 'phase-3' },
    });
    expect(errorsOf(makeReport({ findings: [finding], counts: { blockers: 1, warnings: 0, unknowns: 0 } }))).toEqual([]);
  });
});

describe('validateReport — evidence invariants (AT-26 groundwork)', () => {
  it('rejects a fail finding with zero evidence', () => {
    const errors = errorsOf(makeReport({ findings: [makeFinding({ outcome: 'fail', evidence: [] })] }));
    expect(errors.some((e) => e.includes('evidence'))).toBe(true);
  });

  it('rejects a warning-outcome finding with zero evidence', () => {
    const finding = makeFinding({ outcome: 'warning', severity: 'warning', evidence: [] });
    const errors = errorsOf(makeReport({ findings: [finding] }));
    expect(errors.some((e) => e.includes('evidence'))).toBe(true);
  });

  it('accepts a pass finding with zero evidence', () => {
    const finding = makeFinding({ outcome: 'pass', evidence: [] });
    expect(errorsOf(makeReport({ findings: [finding] }))).toEqual([]);
  });

  it('rejects absence evidence without a note', () => {
    const absence = makeAbsenceEvidence();
    delete (absence as Partial<typeof absence>).note;
    const errors = errorsOf(makeReport({ findings: [makeFinding({ evidence: [absence] })] }));
    expect(errors.some((e) => e.includes('note'))).toBe(true);
  });

  it('rejects absence evidence with an empty note', () => {
    const absence = makeAbsenceEvidence({ note: '' });
    const errors = errorsOf(makeReport({ findings: [makeFinding({ evidence: [absence] })] }));
    expect(errors.some((e) => e.includes('note'))).toBe(true);
  });

  it('rejects absence evidence with a non-empty excerpt', () => {
    const absence = makeAbsenceEvidence({ excerpt: 'some code' });
    const errors = errorsOf(makeReport({ findings: [makeFinding({ evidence: [absence] })] }));
    expect(errors.some((e) => e.includes('excerpt'))).toBe(true);
  });

  it('accepts well-formed absence evidence', () => {
    const errors = errorsOf(makeReport({ findings: [makeFinding({ evidence: [makeAbsenceEvidence()] })] }));
    expect(errors).toEqual([]);
  });

  it('rejects evidence with endLine before startLine', () => {
    const errors = errorsOf(
      makeReport({ findings: [makeFinding({ evidence: [makeEvidence({ startLine: 10, endLine: 2 })] })] }),
    );
    expect(errors.some((e) => e.includes('endLine'))).toBe(true);
  });
});

describe('validateReport — confidence invariants (§6.1)', () => {
  it('rejects a confirmed finding whose confidence is not exactly 1.0', () => {
    const errors = errorsOf(makeReport({ findings: [makeFinding({ classification: 'confirmed', confidence: 0.95 })] }));
    expect(errors.some((e) => e.includes('confidence'))).toBe(true);
  });

  it('rejects an inferred finding whose confidence exceeds the 0.9 cap', () => {
    const errors = errorsOf(makeReport({ findings: [makeFinding({ classification: 'inferred', confidence: 0.95 })] }));
    expect(errors.some((e) => e.includes('confidence'))).toBe(true);
  });

  it('accepts an inferred finding at exactly the 0.9 cap', () => {
    const errors = errorsOf(makeReport({ findings: [makeFinding({ classification: 'inferred', confidence: 0.9 })] }));
    expect(errors).toEqual([]);
  });

  it('rejects confidence outside [0, 1]', () => {
    const tooHigh = errorsOf(makeReport({ findings: [makeFinding({ classification: 'confirmed', confidence: 1.5 })] }));
    const tooLow = errorsOf(makeReport({ findings: [makeFinding({ classification: 'inferred', confidence: -0.1 })] }));
    expect(tooHigh.some((e) => e.includes('confidence'))).toBe(true);
    expect(tooLow.some((e) => e.includes('confidence'))).toBe(true);
  });

  it('rejects a non-finite product confidence', () => {
    const errors = errorsOf(makeReport({ product: { inferredModel: 'x', confidence: Number.NaN, evidence: [] } }));
    expect(errors.some((e) => e.includes('product.confidence'))).toBe(true);
  });
});
