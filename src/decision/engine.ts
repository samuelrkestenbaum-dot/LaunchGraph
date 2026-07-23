/**
 * §7 readiness-decision engine.
 *
 * The decision is computed by deterministic rules over findings — never by
 * a model. Rules fire in order; every fired rule is recorded in
 * `decision.reasons`. This function is pure: no I/O, no clock, no
 * randomness, and the caller's findings are never mutated. Rule-4/5
 * reclassifications are applied to copies returned in `findings`.
 */
import { isBlockerCapable } from '../checks/registry.js';
import type { DecisionValue, Finding } from '../schema/index.js';

export interface DecisionCounts {
  blockers: number;
  warnings: number;
  unknowns: number;
}

export interface DecisionInput {
  findings: readonly Finding[];
  /** §2.3: whether the repository is a supported Next.js/TypeScript stack. */
  stackSupported: boolean;
}

export interface DecisionResult {
  value: DecisionValue;
  /** Every fired rule, in firing order, human-readable. */
  reasons: string[];
  counts: DecisionCounts;
  /** The findings with rule-4/5 reclassifications applied. */
  findings: Finding[];
}

/** Sorted, comma-joined finding ids for stable, readable reason strings. */
function ids(findings: readonly Finding[]): string {
  return findings
    .map((f) => f.id)
    .sort()
    .join(', ');
}

/**
 * Counts findings for `Report.counts`.
 *
 * - blockers: blocker-severity `fail` findings still standing after
 *   rule-4/5 reclassification.
 * - warnings: `warning` outcomes, warning-severity `fail` findings, and
 *   blocker-severity `fail` findings reclassified `requires_confirmation`
 *   (§7 rules 4–5: "counted as warnings").
 * - unknowns: `unknown` outcomes.
 */
function countFindings(findings: readonly Finding[]): DecisionCounts {
  let blockers = 0;
  let warnings = 0;
  let unknowns = 0;
  for (const f of findings) {
    if (f.outcome === 'unknown') unknowns += 1;
    const needsConfirmation = f.classification === 'requires_confirmation';
    if (f.severity === 'blocker' && f.outcome === 'fail' && !needsConfirmation) {
      blockers += 1;
    } else if (
      f.outcome === 'warning' ||
      (f.outcome === 'fail' && (f.severity === 'warning' || (f.severity === 'blocker' && needsConfirmation)))
    ) {
      warnings += 1;
    }
  }
  return { blockers, warnings, unknowns };
}

export function decide(input: DecisionInput): DecisionResult {
  const reasons: string[] = [];

  // Rule 1: stack unsupported (§2.3) → not_evaluated. Stop.
  if (!input.stackSupported) {
    const findings = input.findings.map((f) => ({ ...f }));
    reasons.push('Rule 1: unsupported stack — decision not_evaluated; checks were not run.');
    return { value: 'not_evaluated', reasons, counts: countFindings(findings), findings };
  }

  // Work on copies so rule-4/5 reclassification never mutates the input.
  const findings = input.findings.map((f) => ({ ...f }));

  // Rule 2: confirmed blocker failure → not_ready.
  const rule2 = findings.filter(
    (f) => f.severity === 'blocker' && f.outcome === 'fail' && f.classification === 'confirmed',
  );
  if (rule2.length > 0) {
    reasons.push(`Rule 2: confirmed blocker failure(s): ${ids(rule2)} → not_ready.`);
  }

  // Rule 3: inferred blocker failure with confidence >= 0.7 → not_ready.
  const rule3 = findings.filter(
    (f) => f.severity === 'blocker' && f.outcome === 'fail' && f.classification === 'inferred' && f.confidence >= 0.7,
  );
  if (rule3.length > 0) {
    reasons.push(`Rule 3: inferred blocker failure(s) with confidence >= 0.7: ${ids(rule3)} → not_ready.`);
  }

  // Rule 4: inferred blocker failures below 0.7 → reclassified
  // requires_confirmation and counted as warnings ("needs your confirmation").
  const rule4 = findings.filter(
    (f) => f.severity === 'blocker' && f.outcome === 'fail' && f.classification === 'inferred' && f.confidence < 0.7,
  );
  for (const f of rule4) f.classification = 'requires_confirmation';
  if (rule4.length > 0) {
    reasons.push(
      `Rule 4: inferred blocker finding(s) below confidence 0.7 reclassified requires_confirmation and counted as warnings: ${ids(rule4)}.`,
    );
  }

  // Rule 5: contradictory failures on blocker-capable checks → treated as
  // rule 4. "Blocker-capable" comes from the §3 registry severity ceiling.
  const rule5 = findings.filter(
    (f) => f.outcome === 'fail' && f.classification === 'contradictory' && isBlockerCapable(f.checkId),
  );
  for (const f of rule5) f.classification = 'requires_confirmation';
  if (rule5.length > 0) {
    reasons.push(
      `Rule 5: contradictory finding(s) on blocker-capable checks reclassified requires_confirmation and counted as warnings: ${ids(rule5)}.`,
    );
  }

  const counts = countFindings(findings);
  const notReady = rule2.length > 0 || rule3.length > 0;
  if (notReady) {
    return { value: 'not_ready', reasons, counts, findings };
  }

  // Rule 6: no rule 2–3 firing — warnings, unknown outcomes on
  // blocker-capable checks, or pending external verifications.
  const unknownOnBlockerCapable = findings.filter((f) => f.outcome === 'unknown' && isBlockerCapable(f.checkId));
  const pendingExternal = findings.filter(
    (f) => f.externalVerification !== undefined || f.classification === 'unverified',
  );
  if (counts.warnings > 0 || unknownOnBlockerCapable.length > 0 || pendingExternal.length > 0) {
    reasons.push(
      `Rule 6: ${counts.warnings} warning(s), ${unknownOnBlockerCapable.length} unknown outcome(s) on blocker-capable checks, ${pendingExternal.length} pending external verification(s) → ready_with_warnings.`,
    );
    return { value: 'ready_with_warnings', reasons, counts, findings };
  }

  // Rule 7: otherwise → ready.
  reasons.push('Rule 7: no blockers, warnings, blocker-capable unknowns, or pending external verifications → ready.');
  return { value: 'ready', reasons, counts, findings };
}
