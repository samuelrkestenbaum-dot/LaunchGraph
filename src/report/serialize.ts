/**
 * Canonical JSON serializer for §5 reports (AT-23 groundwork).
 *
 * Serializing the same report twice — or two structurally identical
 * reports assembled in different insertion orders — yields byte-identical
 * output:
 *
 * - object keys are emitted in a fixed canonical order (the §5 declaration
 *   order); free-form `unknown` values (`Fact.value`) are emitted with
 *   keys sorted;
 * - findings are sorted by (checkId, id) and facts by id;
 * - output is LF-only, two-space indented, ending in a single newline;
 * - absent optional keys are omitted entirely.
 *
 * `scannedAt` participates in serialization; determinism comparisons fix
 * it (AT-23 excludes `scannedAt`).
 */
import type { Evidence, Fact, Finding, Report } from '../schema/index.js';

/** Locale-independent code-unit string comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareFindings(a: Finding, b: Finding): number {
  return compareStrings(a.checkId, b.checkId) || compareStrings(a.id, b.id);
}

/** Recursively sorts object keys in free-form JSON values. */
function canonicalUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalUnknown);
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort(compareStrings)) {
      result[key] = canonicalUnknown(source[key]);
    }
    return result;
  }
  return value;
}

function canonicalEvidence(evidence: Evidence): Record<string, unknown> {
  return {
    path: evidence.path,
    startLine: evidence.startLine,
    endLine: evidence.endLine,
    excerpt: evidence.excerpt,
    kind: evidence.kind,
    ...(evidence.note !== undefined ? { note: evidence.note } : {}),
  };
}

function canonicalFact(fact: Fact): Record<string, unknown> {
  return {
    id: fact.id,
    detector: fact.detector,
    value: canonicalUnknown(fact.value),
    evidence: fact.evidence.map(canonicalEvidence),
  };
}

function canonicalFinding(finding: Finding): Record<string, unknown> {
  return {
    id: finding.id,
    checkId: finding.checkId,
    title: finding.title,
    severity: finding.severity,
    outcome: finding.outcome,
    classification: finding.classification,
    confidence: finding.confidence,
    summary: finding.summary,
    evidence: finding.evidence.map(canonicalEvidence),
    ...(finding.externalVerification !== undefined
      ? {
          externalVerification: {
            provider: finding.externalVerification.provider,
            what: finding.externalVerification.what,
            phase: finding.externalVerification.phase,
          },
        }
      : {}),
    ...(finding.remediationPackageId !== undefined ? { remediationPackageId: finding.remediationPackageId } : {}),
  };
}

function canonicalReport(report: Report): Record<string, unknown> {
  return {
    schemaVersion: report.schemaVersion,
    launchgraphVersion: report.launchgraphVersion,
    scannedAt: report.scannedAt,
    repo: { root: report.repo.root, commit: report.repo.commit, dirty: report.repo.dirty },
    stack: report.stack.map((entry) => ({
      provider: entry.provider,
      signals: [...entry.signals],
      support: entry.support,
    })),
    product: {
      inferredModel: report.product.inferredModel,
      confidence: report.product.confidence,
      evidence: report.product.evidence.map(canonicalEvidence),
    },
    facts: [...report.facts].sort((a, b) => compareStrings(a.id, b.id)).map(canonicalFact),
    findings: [...report.findings].sort(compareFindings).map(canonicalFinding),
    decision: { value: report.decision.value, reasons: [...report.decision.reasons] },
    counts: {
      blockers: report.counts.blockers,
      warnings: report.counts.warnings,
      unknowns: report.counts.unknowns,
    },
  };
}

/** Serializes a §5 report to canonical, byte-deterministic JSON. */
export function serializeReport(report: Report): string {
  return `${JSON.stringify(canonicalReport(report), null, 2)}\n`;
}
