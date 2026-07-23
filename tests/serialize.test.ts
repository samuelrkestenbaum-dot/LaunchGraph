import { describe, expect, it } from 'vitest';

import { serializeReport } from '../src/report/serialize.js';
import { validateReport } from '../src/schema/index.js';
import type { Fact, Finding, Report } from '../src/schema/index.js';
import { makeEvidence, makeFinding, makeReport } from './support/builders.js';

const factA: Fact = {
  id: 'fact:resend.sdk-detected',
  detector: 'dependency-manifest',
  value: { package: 'resend' },
  evidence: [makeEvidence({ path: 'package.json', kind: 'manifest' })],
};
const factB: Fact = {
  id: 'fact:stripe.sdk-detected',
  detector: 'dependency-manifest',
  value: { package: 'stripe' },
  evidence: [makeEvidence({ path: 'package.json', kind: 'manifest' })],
};

const f1 = (): Finding => makeFinding({ id: 'LG-001-001', checkId: 'LG-001', title: 'Production callbacks using localhost' });
const f2 = (): Finding => makeFinding({ id: 'LG-001-002', checkId: 'LG-001', title: 'Production callbacks using localhost' });
const f3 = (): Finding => makeFinding();

describe('canonical serializer', () => {
  it('serializing the same report twice yields byte-identical output', () => {
    const report = makeReport({ facts: [factA, factB], findings: [f1(), f3(), f2()] });
    expect(serializeReport(report)).toBe(serializeReport(report));
  });

  it('is independent of array insertion order for findings and facts', () => {
    const a = makeReport({ facts: [factA, factB], findings: [f1(), f2(), f3()] });
    const b = makeReport({ facts: [factB, factA], findings: [f3(), f2(), f1()] });
    expect(serializeReport(a)).toBe(serializeReport(b));
  });

  it('is independent of object key insertion order', () => {
    const a = makeReport({ findings: [f3()] });
    // Same report assembled with keys in a different insertion order.
    const shuffled = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    const reversed: Record<string, unknown> = {};
    for (const key of Object.keys(shuffled).reverse()) reversed[key] = shuffled[key];
    const finding = (reversed['findings'] as Record<string, unknown>[])[0]!;
    const reversedFinding: Record<string, unknown> = {};
    for (const key of Object.keys(finding).reverse()) reversedFinding[key] = finding[key];
    reversed['findings'] = [reversedFinding];
    expect(serializeReport(reversed as unknown as Report)).toBe(serializeReport(a));
  });

  it('canonicalizes unknown fact values by key order', () => {
    const v1: Fact = { ...factA, value: { alpha: 1, beta: { x: 1, y: 2 } } };
    const v2: Fact = { ...factA, value: JSON.parse('{"beta":{"y":2,"x":1},"alpha":1}') as unknown };
    expect(serializeReport(makeReport({ facts: [v1] }))).toBe(serializeReport(makeReport({ facts: [v2] })));
  });

  it('sorts findings by checkId then id, and facts by id', () => {
    const report = makeReport({ facts: [factB, factA], findings: [f3(), f2(), f1()] });
    const parsed = JSON.parse(serializeReport(report)) as Report;
    expect(parsed.findings.map((f) => f.id)).toEqual(['LG-001-001', 'LG-001-002', 'LG-004-001']);
    expect(parsed.facts.map((f) => f.id)).toEqual(['fact:resend.sdk-detected', 'fact:stripe.sdk-detected']);
  });

  it('emits LF-only output ending in a single newline', () => {
    const serialized = serializeReport(makeReport({ findings: [f3()] }));
    expect(serialized.includes('\r')).toBe(false);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized.endsWith('\n\n')).toBe(false);
  });

  it('omits absent optional keys', () => {
    const parsed = JSON.parse(serializeReport(makeReport({ findings: [f3()] }))) as {
      findings: Record<string, unknown>[];
    };
    const finding = parsed.findings[0]!;
    expect('externalVerification' in finding).toBe(false);
    expect('remediationPackageId' in finding).toBe(false);
    const evidence = (finding['evidence'] as Record<string, unknown>[])[0]!;
    expect('note' in evidence).toBe(false);
  });

  it('scannedAt participates in serialization (AT-23: compared with scannedAt fixed)', () => {
    const at1 = makeReport({ scannedAt: '2026-07-23T00:00:00.000Z' });
    const at2 = makeReport({ scannedAt: '2026-07-24T12:34:56.000Z' });
    expect(serializeReport(at1)).not.toBe(serializeReport(at2));
    expect(serializeReport(at1)).toBe(serializeReport(makeReport({ scannedAt: '2026-07-23T00:00:00.000Z' })));
  });

  it('round-trips to a schema-valid report', () => {
    const report = makeReport({
      stack: [{ provider: 'stripe', signals: ['dependency:stripe'], support: 'fully_supported' }],
      facts: [factA],
      findings: [
        makeFinding({
          externalVerification: { provider: 'stripe', what: 'production endpoint subscribes to events', phase: 'phase-3' },
          remediationPackageId: 'LG-004-001-verify-webhook-signature',
        }),
      ],
      counts: { blockers: 1, warnings: 0, unknowns: 0 },
    });
    const parsed: unknown = JSON.parse(serializeReport(report));
    expect(validateReport(parsed).errors).toEqual([]);
  });
});
