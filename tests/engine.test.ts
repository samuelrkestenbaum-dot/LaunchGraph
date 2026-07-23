import { describe, expect, it } from 'vitest';

import { decide } from '../src/decision/engine.js';
import type { Finding } from '../src/schema/index.js';
import { makeFinding } from './support/builders.js';

const confirmedBlockerFail = (id = 'LG-004-001'): Finding =>
  makeFinding({ id, checkId: 'LG-004', classification: 'confirmed', confidence: 1 });

const inferredBlockerFail = (confidence: number, id = 'LG-006-001'): Finding =>
  makeFinding({ id, checkId: 'LG-006', title: 'Missing cancellation handling', classification: 'inferred', confidence });

describe('decision engine — rule 1 (unsupported stack)', () => {
  it('returns not_evaluated and stops, even when blocker findings are present', () => {
    const result = decide({ findings: [confirmedBlockerFail()], stackSupported: false });
    expect(result.value).toBe('not_evaluated');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/^Rule 1:/);
  });

  it('returns not_evaluated with zero findings', () => {
    const result = decide({ findings: [], stackSupported: false });
    expect(result.value).toBe('not_evaluated');
    expect(result.findings).toEqual([]);
    expect(result.counts).toEqual({ blockers: 0, warnings: 0, unknowns: 0 });
  });
});

describe('decision engine — rule 2 (confirmed blocker failure)', () => {
  it('returns not_ready and records the rule with the finding id', () => {
    const result = decide({ findings: [confirmedBlockerFail()], stackSupported: true });
    expect(result.value).toBe('not_ready');
    expect(result.reasons[0]).toMatch(/^Rule 2:/);
    expect(result.reasons[0]).toContain('LG-004-001');
    expect(result.counts.blockers).toBe(1);
  });

  it('does not fire for confirmed blocker findings that pass', () => {
    const result = decide({
      findings: [makeFinding({ outcome: 'pass', classification: 'confirmed', evidence: [] })],
      stackSupported: true,
    });
    expect(result.value).toBe('ready');
  });
});

describe('decision engine — rule 3 (inferred blocker failure, confidence >= 0.7)', () => {
  it('returns not_ready at exactly 0.7', () => {
    const result = decide({ findings: [inferredBlockerFail(0.7)], stackSupported: true });
    expect(result.value).toBe('not_ready');
    expect(result.reasons[0]).toMatch(/^Rule 3:/);
    expect(result.reasons[0]).toContain('LG-006-001');
  });

  it('returns not_ready at 0.9', () => {
    expect(decide({ findings: [inferredBlockerFail(0.9)], stackSupported: true }).value).toBe('not_ready');
  });
});

describe('decision engine — rule 4 (inferred blocker failure below 0.7)', () => {
  it('reclassifies to requires_confirmation, counts it as a warning, and lands on ready_with_warnings', () => {
    const result = decide({ findings: [inferredBlockerFail(0.65)], stackSupported: true });
    expect(result.value).toBe('ready_with_warnings');
    expect(result.reasons[0]).toMatch(/^Rule 4:/);
    expect(result.reasons[0]).toContain('LG-006-001');
    expect(result.reasons[1]).toMatch(/^Rule 6:/);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.classification).toBe('requires_confirmation');
    expect(result.findings[0]?.severity).toBe('blocker');
    expect(result.counts).toEqual({ blockers: 0, warnings: 1, unknowns: 0 });
  });

  it('does not mutate the caller-supplied findings', () => {
    const input = inferredBlockerFail(0.5);
    decide({ findings: [input], stackSupported: true });
    expect(input.classification).toBe('inferred');
  });
});

describe('decision engine — rule 5 (contradictory on blocker-capable checks)', () => {
  it('treats a contradictory fail on a blocker-capable check like rule 4', () => {
    const contradictory = makeFinding({
      id: 'LG-005-001',
      checkId: 'LG-005',
      title: 'Non-idempotent webhook processing',
      classification: 'contradictory',
      confidence: 0.8,
    });
    const result = decide({ findings: [contradictory], stackSupported: true });
    expect(result.value).toBe('ready_with_warnings');
    expect(result.reasons[0]).toMatch(/^Rule 5:/);
    expect(result.reasons[0]).toContain('LG-005-001');
    expect(result.findings[0]?.classification).toBe('requires_confirmation');
    expect(result.counts).toEqual({ blockers: 0, warnings: 1, unknowns: 0 });
  });

  it('leaves contradictory findings on warning-ceiling checks unreclassified', () => {
    const contradictory = makeFinding({
      id: 'LG-010-001',
      checkId: 'LG-010',
      title: 'Unauthenticated email domain',
      severity: 'warning',
      classification: 'contradictory',
      confidence: 0.8,
    });
    const result = decide({ findings: [contradictory], stackSupported: true });
    expect(result.findings[0]?.classification).toBe('contradictory');
    expect(result.value).toBe('ready_with_warnings');
    expect(result.reasons.some((r) => r.startsWith('Rule 5:'))).toBe(false);
  });
});

describe('decision engine — rule 6 (warnings, blocker-capable unknowns, pending external)', () => {
  it('fires for a warning-severity failure', () => {
    const warning = makeFinding({
      id: 'LG-010-001',
      checkId: 'LG-010',
      severity: 'warning',
      classification: 'confirmed',
      confidence: 1,
    });
    const result = decide({ findings: [warning], stackSupported: true });
    expect(result.value).toBe('ready_with_warnings');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/^Rule 6:/);
    expect(result.counts.warnings).toBe(1);
  });

  it('fires for a warning outcome', () => {
    const warned = makeFinding({ id: 'LG-012-001', checkId: 'LG-012', severity: 'warning', outcome: 'warning', classification: 'unverified', confidence: 1 });
    const result = decide({ findings: [warned], stackSupported: true });
    expect(result.value).toBe('ready_with_warnings');
  });

  it('fires for an unknown outcome on a blocker-capable check', () => {
    const unknown = makeFinding({
      id: 'LG-005-001',
      checkId: 'LG-005',
      outcome: 'unknown',
      classification: 'unverified',
      confidence: 0.5,
      evidence: [],
    });
    const result = decide({ findings: [unknown], stackSupported: true });
    expect(result.value).toBe('ready_with_warnings');
    expect(result.counts.unknowns).toBe(1);
  });

  it('does not fire for an unknown outcome on a warning-ceiling check alone', () => {
    const unknown = makeFinding({
      id: 'LG-014-001',
      checkId: 'LG-014',
      severity: 'warning',
      outcome: 'unknown',
      classification: 'confirmed',
      confidence: 1,
      evidence: [],
    });
    const result = decide({ findings: [unknown], stackSupported: true });
    expect(result.value).toBe('ready');
    expect(result.counts.unknowns).toBe(1);
  });

  it('fires for a pending external verification even on a passing finding', () => {
    const pending = makeFinding({
      id: 'LG-003-001',
      checkId: 'LG-003',
      outcome: 'pass',
      classification: 'confirmed',
      confidence: 1,
      evidence: [],
      externalVerification: { provider: 'stripe', what: 'production endpoint subscribes to events', phase: 'phase-3' },
    });
    const result = decide({ findings: [pending], stackSupported: true });
    expect(result.value).toBe('ready_with_warnings');
    expect(result.reasons[0]).toMatch(/^Rule 6:/);
  });
});

describe('decision engine — rule 7 (ready)', () => {
  it('returns ready for zero findings', () => {
    const result = decide({ findings: [], stackSupported: true });
    expect(result.value).toBe('ready');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/^Rule 7:/);
    expect(result.counts).toEqual({ blockers: 0, warnings: 0, unknowns: 0 });
  });

  it('returns ready for passing findings without external verification', () => {
    const pass = makeFinding({ outcome: 'pass', classification: 'confirmed', confidence: 1, evidence: [] });
    expect(decide({ findings: [pass], stackSupported: true }).value).toBe('ready');
  });
});

describe('decision engine — reason ordering and combination', () => {
  it('records every fired rule in firing order (rules 2, 3, 4, 5 together)', () => {
    const findings = [
      inferredBlockerFail(0.5, 'LG-007-001'),
      makeFinding({ id: 'LG-005-001', checkId: 'LG-005', classification: 'contradictory', confidence: 0.8 }),
      confirmedBlockerFail(),
      inferredBlockerFail(0.85, 'LG-006-001'),
    ];
    const result = decide({ findings, stackSupported: true });
    expect(result.value).toBe('not_ready');
    expect(result.reasons.map((r) => r.split(':')[0])).toEqual(['Rule 2', 'Rule 3', 'Rule 4', 'Rule 5']);
    // Rules 6 and 7 must not fire once rules 2–3 have decided not_ready.
    expect(result.reasons.some((r) => r.startsWith('Rule 6:') || r.startsWith('Rule 7:'))).toBe(false);
    // The rule-4/5 transformations still apply on the way to not_ready.
    const byId = new Map(result.findings.map((f) => [f.id, f]));
    expect(byId.get('LG-007-001')?.classification).toBe('requires_confirmation');
    expect(byId.get('LG-005-001')?.classification).toBe('requires_confirmation');
    expect(result.counts).toEqual({ blockers: 2, warnings: 2, unknowns: 0 });
  });

  it('is pure: identical inputs yield identical results', () => {
    const findings = [inferredBlockerFail(0.5), confirmedBlockerFail()];
    const snapshot = JSON.parse(JSON.stringify(findings)) as Finding[];
    const first = decide({ findings, stackSupported: true });
    const second = decide({ findings, stackSupported: true });
    expect(first).toEqual(second);
    expect(findings).toEqual(snapshot);
  });
});
