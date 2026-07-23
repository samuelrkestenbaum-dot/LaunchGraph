import { describe, expect, it } from 'vitest';

import { CHECKS, getCheck, isBlockerCapable } from '../src/checks/registry.js';

/** The §3 table, transcribed verbatim as the expected registry contents. */
const SPEC_TABLE = [
  { id: 'LG-001', title: 'Production callbacks using localhost', severityCeiling: 'blocker', layer: 'D', externalComponent: 'no' },
  { id: 'LG-002', title: 'Stripe test/live key mixing', severityCeiling: 'blocker', layer: 'D', externalComponent: 'no' },
  { id: 'LG-003', title: 'Missing production webhook', severityCeiling: 'blocker', layer: 'D', externalComponent: 'yes' },
  { id: 'LG-004', title: 'Missing webhook signature verification', severityCeiling: 'blocker', layer: 'D', externalComponent: 'no' },
  { id: 'LG-005', title: 'Non-idempotent webhook processing', severityCeiling: 'blocker', layer: 'D+M', externalComponent: 'no' },
  { id: 'LG-006', title: 'Missing cancellation handling', severityCeiling: 'blocker', layer: 'D+M', externalComponent: 'no' },
  { id: 'LG-007', title: 'Payment not connected to entitlement', severityCeiling: 'blocker', layer: 'M', externalComponent: 'no' },
  { id: 'LG-008', title: 'Preview deployment using production database', severityCeiling: 'blocker', layer: 'D', externalComponent: 'partial' },
  { id: 'LG-009', title: 'Missing tenant-isolation evidence', severityCeiling: 'blocker', layer: 'D+M', externalComponent: 'no' },
  { id: 'LG-010', title: 'Unauthenticated email domain', severityCeiling: 'warning', layer: 'D', externalComponent: 'yes' },
  { id: 'LG-011', title: 'Production email links using the wrong hostname', severityCeiling: 'blocker', layer: 'D+M', externalComponent: 'no' },
  { id: 'LG-012', title: 'Password recovery unverified', severityCeiling: 'blocker', layer: 'D+M', externalComponent: 'yes' },
  { id: 'LG-013', title: 'Missing signup or purchase conversion event', severityCeiling: 'warning', layer: 'D+M', externalComponent: 'no' },
  { id: 'LG-014', title: 'Sentry installed but unverified in production', severityCeiling: 'warning', layer: 'D', externalComponent: 'yes' },
  { id: 'LG-015', title: 'Missing or unverified production domain', severityCeiling: 'blocker', layer: 'D', externalComponent: 'yes' },
] as const;

describe('check registry (§3)', () => {
  it('contains exactly the 15 checks LG-001..LG-015, in order', () => {
    expect(CHECKS.map((c) => c.id)).toEqual(SPEC_TABLE.map((row) => row.id));
  });

  it('has unique check ids', () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the §3 table exactly (title, severity ceiling, layer, external component)', () => {
    expect(CHECKS.map((c) => ({ ...c }))).toEqual(SPEC_TABLE.map((row) => ({ ...row })));
  });

  it('marks LG-012 as a blocker-ceiling check', () => {
    expect(getCheck('LG-012')?.severityCeiling).toBe('blocker');
  });

  it('getCheck returns the definition for a known id and undefined otherwise', () => {
    expect(getCheck('LG-004')?.title).toBe('Missing webhook signature verification');
    expect(getCheck('LG-999')).toBeUndefined();
  });

  it('isBlockerCapable reflects the severity ceiling', () => {
    const blockerCapable = SPEC_TABLE.filter((r) => r.severityCeiling === 'blocker').map((r) => r.id);
    const warningOnly = SPEC_TABLE.filter((r) => r.severityCeiling === 'warning').map((r) => r.id);
    expect(warningOnly).toEqual(['LG-010', 'LG-013', 'LG-014']);
    for (const id of blockerCapable) expect(isBlockerCapable(id), id).toBe(true);
    for (const id of warningOnly) expect(isBlockerCapable(id), id).toBe(false);
    expect(isBlockerCapable('LG-999')).toBe(false);
  });

  it('contains metadata only — no detector logic', () => {
    for (const check of CHECKS) {
      for (const value of Object.values(check)) {
        expect(typeof value).toBe('string');
      }
    }
  });
});
