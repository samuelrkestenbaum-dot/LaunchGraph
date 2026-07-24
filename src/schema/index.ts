/**
 * §5 canonical finding and evidence schemas.
 *
 * These are the exact shapes from `specs/phase-1-repository-auditor.md` §5.
 * The JSON report serializes exactly these shapes; the schema version is
 * embedded in every report. `validateReport` enforces the §5 invariants and
 * the §6.1 confidence rules at runtime.
 */

/** Version of the §5 report schema embedded in every report. */
export const SCHEMA_VERSION = '1';

export type Classification =
  | 'confirmed' // deterministic evidence
  | 'inferred' // model-assisted, evidence-cited
  | 'unverified' // requires external (provider) verification
  | 'contradictory' // deterministic and model signals disagree
  | 'requires_confirmation'; // material ambiguity a human must resolve

export type Severity = 'blocker' | 'warning' | 'info';
export type CheckOutcome = 'pass' | 'fail' | 'warning' | 'unknown' | 'not_applicable';
export type SupportLevel = 'fully_supported' | 'guided' | 'experimental' | 'unsupported';

export type EvidenceKind = 'code' | 'config' | 'manifest' | 'schema' | 'absence';

export interface Evidence {
  path: string; // repo-relative
  startLine: number;
  endLine: number;
  excerpt: string; // ALWAYS secret-redacted (§10.3)
  kind: EvidenceKind;
  note?: string; // why this excerpt matters
}
// kind 'absence' documents a searched-but-missing signal: path is the
// location searched, excerpt is empty, note states what was expected.

export interface Fact {
  id: string; // e.g. "fact:stripe.sdk-detected"
  detector: string; // which deterministic detector produced it
  value: unknown;
  evidence: Evidence[];
}

export interface Inference {
  id: string;
  question: string; // the bounded question asked
  answer: unknown;
  confidence: number; // 0..1, from the model, capped at 0.9
  supportingFacts: string[]; // Fact ids provided as context
  evidence: Evidence[]; // citations; uncited answers are discarded
}

export interface Finding {
  id: string; // e.g. "LG-006-001"
  checkId: string; // "LG-006"
  title: string;
  severity: Severity;
  outcome: CheckOutcome;
  classification: Classification;
  confidence: number; // 1.0 for confirmed; model-capped otherwise
  summary: string; // one-sentence statement of the condition
  evidence: Evidence[]; // never empty for fail/warning findings
  externalVerification?: {
    provider: string; // e.g. "stripe"
    what: string; // e.g. "production endpoint subscribes to event"
    phase: 'phase-3';
  };
  remediationPackageId?: string;
}

export type DecisionValue = 'ready' | 'ready_with_warnings' | 'not_ready' | 'not_evaluated';

export interface Report {
  schemaVersion: string;
  sugarbeeVersion: string;
  scannedAt: string; // ISO 8601
  repo: { root: string; commit: string | null; dirty: boolean };
  stack: Array<{ provider: string; signals: string[]; support: SupportLevel }>;
  product: { inferredModel: string; confidence: number; evidence: Evidence[] };
  facts: Fact[];
  findings: Finding[];
  decision: {
    value: DecisionValue;
    reasons: string[]; // every rule that fired, in order
  };
  counts: { blockers: number; warnings: number; unknowns: number };
}

export const CLASSIFICATIONS: readonly Classification[] = [
  'confirmed',
  'inferred',
  'unverified',
  'contradictory',
  'requires_confirmation',
];
export const SEVERITIES: readonly Severity[] = ['blocker', 'warning', 'info'];
export const CHECK_OUTCOMES: readonly CheckOutcome[] = ['pass', 'fail', 'warning', 'unknown', 'not_applicable'];
export const SUPPORT_LEVELS: readonly SupportLevel[] = ['fully_supported', 'guided', 'experimental', 'unsupported'];
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ['code', 'config', 'manifest', 'schema', 'absence'];
export const DECISION_VALUES: readonly DecisionValue[] = ['ready', 'ready_with_warnings', 'not_ready', 'not_evaluated'];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function checkString(errors: string[], value: unknown, path: string, opts: { nonEmpty?: boolean } = {}): value is string {
  if (typeof value !== 'string') {
    errors.push(`${path}: expected a string`);
    return false;
  }
  if (opts.nonEmpty && value.length === 0) {
    errors.push(`${path}: must be a non-empty string`);
    return false;
  }
  return true;
}

function checkStringArray(errors: string[], value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array of strings`);
    return;
  }
  value.forEach((entry, i) => checkString(errors, entry, `${path}[${i}]`));
}

function checkNonNegativeInteger(errors: string[], value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`${path}: expected a non-negative integer`);
  }
}

function checkConfidence(errors: string[], value: unknown, path: string): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${path}: expected a number in [0, 1]`);
    return false;
  }
  return true;
}

function validateEvidence(errors: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an Evidence object`);
    return;
  }
  checkString(errors, value['path'], `${path}.path`, { nonEmpty: true });
  const { startLine, endLine } = value as { startLine?: unknown; endLine?: unknown };
  checkNonNegativeInteger(errors, startLine, `${path}.startLine`);
  checkNonNegativeInteger(errors, endLine, `${path}.endLine`);
  if (typeof startLine === 'number' && typeof endLine === 'number' && endLine < startLine) {
    errors.push(`${path}.endLine: must be >= startLine`);
  }
  checkString(errors, value['excerpt'], `${path}.excerpt`);
  if (!isOneOf(value['kind'], EVIDENCE_KINDS)) {
    errors.push(`${path}.kind: expected one of ${EVIDENCE_KINDS.join(', ')}`);
  } else if (value['kind'] === 'absence') {
    // §5 invariant: 'absence' evidence documents a searched-but-missing
    // signal — the excerpt is empty and the note states what was expected.
    if (typeof value['note'] !== 'string' || value['note'].length === 0) {
      errors.push(`${path}.note: 'absence' evidence requires a non-empty note stating what was expected`);
    }
    if (value['excerpt'] !== '') {
      errors.push(`${path}.excerpt: 'absence' evidence must have an empty excerpt`);
    }
  }
  if (value['note'] !== undefined && typeof value['note'] !== 'string') {
    errors.push(`${path}.note: expected a string when present`);
  }
}

function validateEvidenceArray(errors: string[], value: unknown, path: string): value is Evidence[] {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array of Evidence`);
    return false;
  }
  value.forEach((entry, i) => validateEvidence(errors, entry, `${path}[${i}]`));
  return true;
}

function validateFact(errors: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected a Fact object`);
    return;
  }
  checkString(errors, value['id'], `${path}.id`, { nonEmpty: true });
  checkString(errors, value['detector'], `${path}.detector`, { nonEmpty: true });
  validateEvidenceArray(errors, value['evidence'], `${path}.evidence`);
}

function validateFinding(errors: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected a Finding object`);
    return;
  }
  checkString(errors, value['id'], `${path}.id`, { nonEmpty: true });
  checkString(errors, value['checkId'], `${path}.checkId`, { nonEmpty: true });
  checkString(errors, value['title'], `${path}.title`, { nonEmpty: true });
  checkString(errors, value['summary'], `${path}.summary`);
  if (!isOneOf(value['severity'], SEVERITIES)) {
    errors.push(`${path}.severity: expected one of ${SEVERITIES.join(', ')}`);
  }
  const outcome = value['outcome'];
  if (!isOneOf(outcome, CHECK_OUTCOMES)) {
    errors.push(`${path}.outcome: expected one of ${CHECK_OUTCOMES.join(', ')}`);
  }
  const classification = value['classification'];
  if (!isOneOf(classification, CLASSIFICATIONS)) {
    errors.push(`${path}.classification: expected one of ${CLASSIFICATIONS.join(', ')}`);
  }
  if (checkConfidence(errors, value['confidence'], `${path}.confidence`)) {
    const confidence = value['confidence'] as number;
    // §6.1: deterministic detection → confirmed, confidence 1.0.
    if (classification === 'confirmed' && confidence !== 1) {
      errors.push(`${path}.confidence: 'confirmed' findings must have confidence exactly 1.0`);
    }
    // §6.1: model-assisted → inferred, confidence hard-capped at 0.9.
    if (classification === 'inferred' && confidence > 0.9) {
      errors.push(`${path}.confidence: 'inferred' findings are hard-capped at confidence 0.9`);
    }
  }
  if (validateEvidenceArray(errors, value['evidence'], `${path}.evidence`)) {
    // §5 invariant (AT-26): every fail/warning finding carries ≥1 evidence entry.
    if ((outcome === 'fail' || outcome === 'warning') && (value['evidence'] as Evidence[]).length === 0) {
      errors.push(`${path}.evidence: '${outcome}' findings must carry at least one evidence entry`);
    }
  }
  const external = value['externalVerification'];
  if (external !== undefined) {
    if (!isRecord(external)) {
      errors.push(`${path}.externalVerification: expected an object when present`);
    } else {
      checkString(errors, external['provider'], `${path}.externalVerification.provider`, { nonEmpty: true });
      checkString(errors, external['what'], `${path}.externalVerification.what`, { nonEmpty: true });
      if (external['phase'] !== 'phase-3') {
        errors.push(`${path}.externalVerification.phase: must be 'phase-3'`);
      }
    }
  }
  if (value['remediationPackageId'] !== undefined) {
    checkString(errors, value['remediationPackageId'], `${path}.remediationPackageId`, { nonEmpty: true });
  }
}

/**
 * Validates an unknown value against the §5 `Report` schema and its
 * invariants. Returns every violation found rather than stopping at the
 * first, so reports can be repaired in one pass.
 */
export function validateReport(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['report: expected an object'] };
  }

  if (value['schemaVersion'] !== SCHEMA_VERSION) {
    errors.push(`report.schemaVersion: expected '${SCHEMA_VERSION}'`);
  }
  checkString(errors, value['sugarbeeVersion'], 'report.sugarbeeVersion', { nonEmpty: true });
  if (checkString(errors, value['scannedAt'], 'report.scannedAt', { nonEmpty: true })) {
    if (Number.isNaN(Date.parse(value['scannedAt'] as string))) {
      errors.push('report.scannedAt: expected an ISO 8601 timestamp');
    }
  }

  const repo = value['repo'];
  if (!isRecord(repo)) {
    errors.push('report.repo: expected an object');
  } else {
    checkString(errors, repo['root'], 'report.repo.root', { nonEmpty: true });
    if (repo['commit'] !== null && typeof repo['commit'] !== 'string') {
      errors.push('report.repo.commit: expected a string or null');
    }
    if (typeof repo['dirty'] !== 'boolean') {
      errors.push('report.repo.dirty: expected a boolean');
    }
  }

  const stack = value['stack'];
  if (!Array.isArray(stack)) {
    errors.push('report.stack: expected an array');
  } else {
    stack.forEach((entry, i) => {
      const path = `report.stack[${i}]`;
      if (!isRecord(entry)) {
        errors.push(`${path}: expected an object`);
        return;
      }
      checkString(errors, entry['provider'], `${path}.provider`, { nonEmpty: true });
      checkStringArray(errors, entry['signals'], `${path}.signals`);
      if (!isOneOf(entry['support'], SUPPORT_LEVELS)) {
        errors.push(`${path}.support: expected one of ${SUPPORT_LEVELS.join(', ')}`);
      }
    });
  }

  const product = value['product'];
  if (!isRecord(product)) {
    errors.push('report.product: expected an object');
  } else {
    checkString(errors, product['inferredModel'], 'report.product.inferredModel');
    checkConfidence(errors, product['confidence'], 'report.product.confidence');
    validateEvidenceArray(errors, product['evidence'], 'report.product.evidence');
  }

  const facts = value['facts'];
  if (!Array.isArray(facts)) {
    errors.push('report.facts: expected an array');
  } else {
    facts.forEach((fact, i) => validateFact(errors, fact, `report.facts[${i}]`));
  }

  const findings = value['findings'];
  if (!Array.isArray(findings)) {
    errors.push('report.findings: expected an array');
  } else {
    findings.forEach((finding, i) => validateFinding(errors, finding, `report.findings[${i}]`));
  }

  const decision = value['decision'];
  if (!isRecord(decision)) {
    errors.push('report.decision: expected an object');
  } else {
    if (!isOneOf(decision['value'], DECISION_VALUES)) {
      errors.push(`report.decision.value: expected one of ${DECISION_VALUES.join(', ')}`);
    }
    checkStringArray(errors, decision['reasons'], 'report.decision.reasons');
  }

  const counts = value['counts'];
  if (!isRecord(counts)) {
    errors.push('report.counts: expected an object');
  } else {
    checkNonNegativeInteger(errors, counts['blockers'], 'report.counts.blockers');
    checkNonNegativeInteger(errors, counts['warnings'], 'report.counts.warnings');
    checkNonNegativeInteger(errors, counts['unknowns'], 'report.counts.unknowns');
  }

  return { ok: errors.length === 0, errors };
}
