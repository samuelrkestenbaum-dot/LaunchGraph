/**
 * Shared detector helpers.
 *
 * Detectors take their `id`, `title`, and `severity` **from the §3 registry**
 * (`registry.ts`) — never hardcoded — so a check's metadata has one source of
 * truth. This kit wraps that lookup and stamps the §5 confidence rule
 * (deterministic → confirmed, confidence 1.0) so the three deterministic
 * detectors in this slice stay uniform.
 */
import { getCheck } from './registry.js';
import type { CheckOutcome, Classification, Evidence, Finding } from '../schema/index.js';

export interface FindingParams {
  checkId: string;
  /** 1-based sequence within the check, rendered as `LG-00X-00N`. */
  seq: number;
  outcome: CheckOutcome;
  summary: string;
  evidence: Evidence[];
  /** Defaults to `confirmed` (deterministic layer, §6.1). */
  classification?: Classification;
  /** Defaults to 1.0 (confirmed). */
  confidence?: number;
  /**
   * Optional §5 external-verification marker. When present it is spread into
   * the returned Finding verbatim; when absent the key is omitted (so
   * detectors that carry no external half — LG-001/002/004 — are unaffected).
   */
  externalVerification?: Finding['externalVerification'];
}

/** Zero-pads a sequence to the `LG-00X-00N` finding-id convention. */
function seqSuffix(seq: number): string {
  return String(seq).padStart(3, '0');
}

/**
 * Builds a §5 Finding, drawing `title` and `severity` from the registry for
 * `checkId`. Deterministic detectors default to `confirmed` / confidence 1.0.
 */
export function makeFinding(params: FindingParams): Finding {
  const check = getCheck(params.checkId);
  if (check === undefined) {
    throw new Error(`detectorKit: unknown check id "${params.checkId}"`);
  }
  return {
    id: `${params.checkId}-${seqSuffix(params.seq)}`,
    checkId: params.checkId,
    title: check.title,
    severity: check.severityCeiling,
    outcome: params.outcome,
    classification: params.classification ?? 'confirmed',
    confidence: params.confidence ?? 1,
    summary: params.summary,
    evidence: params.evidence,
    ...(params.externalVerification !== undefined
      ? { externalVerification: params.externalVerification }
      : {}),
  };
}

/**
 * Builds a §5 `externalVerification` marker. The `'phase-3'` literal lives
 * here as its single source of truth so detectors never restate it. External
 * verification always belongs to Phase 3 (§13) in Phase 1.
 */
export function makeExternalVerification(
  provider: string,
  what: string,
): NonNullable<Finding['externalVerification']> {
  return { provider, what, phase: 'phase-3' };
}

/** Basename (last POSIX segment) of a repo-relative path. */
export function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Index (0-based) of the first line matching `re`, or -1. */
export function firstLineMatching(lines: readonly string[], re: RegExp): number {
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i] ?? '')) return i;
  }
  return -1;
}
