/**
 * Shared builders for §5 schema objects used across suites.
 *
 * Not a test file — the vitest include pattern only picks up
 * `tests/**\/*.test.ts`.
 */
import type { Evidence, Finding, Report } from '../../src/schema/index.js';
import { SCHEMA_VERSION } from '../../src/schema/index.js';

export function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    path: 'src/app/api/stripe/webhook/route.ts',
    startLine: 9,
    endLine: 14,
    excerpt: 'const event = JSON.parse(rawBody);',
    kind: 'code',
    ...overrides,
  };
}

export function makeAbsenceEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    path: 'supabase/migrations/',
    startLine: 0,
    endLine: 0,
    excerpt: '',
    kind: 'absence',
    note: 'Expected ENABLE ROW LEVEL SECURITY for tenant-owned tables; none found.',
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'LG-004-001',
    checkId: 'LG-004',
    title: 'Missing webhook signature verification',
    severity: 'blocker',
    outcome: 'fail',
    classification: 'confirmed',
    confidence: 1,
    summary: 'The webhook handler consumes the request body without verifying the stripe-signature header.',
    evidence: [makeEvidence()],
    ...overrides,
  };
}

export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: SCHEMA_VERSION,
    sugarbeeVersion: '0.1.0',
    scannedAt: '2026-07-23T00:00:00.000Z',
    repo: { root: '/repo', commit: '5621aa9e691dcc40860b09be6ee2ef30ed345b57', dirty: false },
    stack: [],
    product: { inferredModel: 'B2B subscription SaaS', confidence: 0.85, evidence: [] },
    facts: [],
    findings: [],
    decision: { value: 'ready', reasons: ['Rule 7: no blocking or warning conditions found — ready.'] },
    counts: { blockers: 0, warnings: 0, unknowns: 0 },
    ...overrides,
  };
}
