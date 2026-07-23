/**
 * §3 check registry — the 15 launch-readiness checks.
 *
 * Metadata only: ids, titles, severity ceilings, layer assignment, and
 * external-component flags, transcribed exactly from the §3 table in
 * `specs/phase-1-repository-auditor.md`. Zero detector logic lives here;
 * detectors arrive in later slices and must consume this registry rather
 * than restate it.
 *
 * Check IDs are stable and versioned. Severity is the *ceiling* a failing
 * finding may carry; §7 defines how severity and confidence combine into
 * the decision.
 */
import type { Severity } from '../schema/index.js';

/** §4 layer assignment: D (deterministic), M (model-assisted), or D+M. */
export type CheckLayer = 'D' | 'M' | 'D+M';

/** Whether the check has an inherently external (provider-side) component. */
export type ExternalComponentFlag = 'yes' | 'no' | 'partial';

export interface CheckDefinition {
  readonly id: string;
  readonly title: string;
  readonly severityCeiling: Severity;
  readonly layer: CheckLayer;
  readonly externalComponent: ExternalComponentFlag;
}

export const CHECKS: readonly CheckDefinition[] = [
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
];

const CHECKS_BY_ID: ReadonlyMap<string, CheckDefinition> = new Map(CHECKS.map((check) => [check.id, check]));

/** Look up a check definition by id; undefined for unknown ids. */
export function getCheck(id: string): CheckDefinition | undefined {
  return CHECKS_BY_ID.get(id);
}

/**
 * A check is "blocker-capable" when its §3 severity ceiling is `blocker`.
 * The §7 decision engine uses this to scope rules 5 and 6; unknown check
 * ids are conservatively treated as not blocker-capable.
 */
export function isBlockerCapable(checkId: string): boolean {
  return CHECKS_BY_ID.get(checkId)?.severityCeiling === 'blocker';
}
