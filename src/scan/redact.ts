/**
 * SEC-4 secret redaction and the sole sanctioned Evidence builder.
 *
 * §5 invariant: "no `excerpt` may contain an unredacted secret." Detectors
 * therefore never construct `Evidence` literals from raw repository text —
 * they call {@link buildEvidence} / {@link buildAbsenceEvidence}, which run
 * every excerpt through {@link redact} first. Keeping redaction on the single
 * path into a Finding is what makes the invariant enforceable by inspection.
 *
 * What is masked (SEC-4):
 * - Provider key formats: `sk_live`/`pk_live`/`rk_live`, `sk_test`/`pk_test`,
 *   Stripe webhook secrets (`whsec_`), Resend keys (`re_`). The
 *   `<prefix>_***REDACTED***` shape is preserved so a detector can still show
 *   *that a live/test key was present* without leaking its value.
 * - PEM private-key blocks (any `-----BEGIN … PRIVATE KEY----- … END`).
 * - High-entropy tokens (long base64/hex-ish runs) that look like secrets.
 * - Env-file values, masked **categorically** (every `KEY=value` becomes
 *   `KEY=***REDACTED***`) — env files are where secrets live, so the
 *   conservative reading of SEC-4 masks all values rather than guessing which
 *   are sensitive. Detection still runs on the raw content; only the excerpt
 *   that reaches the Finding is masked.
 *
 * Pure and offline: no clock, no randomness, no I/O.
 */
import type { Evidence, EvidenceKind } from '../schema/index.js';

/** The single redaction marker used everywhere, for grep-ability. */
export const REDACTION_MARKER = '***REDACTED***';

/** Provider key formats whose informative prefix is preserved on redaction. */
const PREFIXED_KEY_RE = /\b((?:sk|pk|rk)_(?:live|test)|whsec|re)_[A-Za-z0-9]{4,}/g;

/** PEM private-key blocks (RSA/EC/OPENSSH/PKCS8/generic). */
const PEM_BLOCK_RE = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g;

/** Candidate high-entropy tokens (long base64/hex-ish runs). */
const HIGH_ENTROPY_CANDIDATE_RE = /[A-Za-z0-9+/=_-]{24,}/g;

/** Shannon entropy in bits/char of a string. */
function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Masks any high-entropy candidate token that both looks random enough
 * (entropy ≥ 3.2 bits/char) to be a secret. Deterministic; over-masking a
 * benign long token is acceptable (safe direction).
 */
function redactHighEntropy(text: string): string {
  return text.replace(HIGH_ENTROPY_CANDIDATE_RE, (token) =>
    shannonEntropy(token) >= 3.2 ? REDACTION_MARKER : token,
  );
}

/**
 * Redacts secrets from an arbitrary text excerpt (not env-specific). Applied
 * to every non-env excerpt before it reaches a Finding.
 */
export function redact(text: string): string {
  let out = text.replace(PEM_BLOCK_RE, `-----BEGIN PRIVATE KEY----- ${REDACTION_MARKER} -----END PRIVATE KEY-----`);
  out = out.replace(PREFIXED_KEY_RE, (_m, prefix: string) => `${prefix}_${REDACTION_MARKER}`);
  out = redactHighEntropy(out);
  return out;
}

/**
 * Categorically masks the value of every `KEY=value` line in env-file text,
 * then applies the standard secret redaction to whatever remains (e.g.
 * comments). Preserves key names and structure; strips all values.
 */
export function redactEnvText(text: string): string {
  const masked = text
    .split('\n')
    .map((line) => {
      const match = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.]*\s*=)(.*)$/.exec(line);
      if (match === null) return line;
      const key = match[1] ?? '';
      const value = (match[2] ?? '').trim();
      return value.length === 0 ? line : `${key}${REDACTION_MARKER}`;
    })
    .join('\n');
  return redact(masked);
}

/** True for `.env`, `.env.production`, `.env.local`, … files. */
export function isEnvFile(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return base === '.env' || base.startsWith('.env.');
}

/** Redacts an excerpt using the strategy appropriate to its file path. */
export function redactForPath(path: string, excerpt: string): string {
  return isEnvFile(path) ? redactEnvText(excerpt) : redact(excerpt);
}

export interface BuildEvidenceParams {
  path: string;
  startLine: number;
  endLine: number;
  /** Raw repository text; redacted before it is stored. */
  rawExcerpt: string;
  kind: Exclude<EvidenceKind, 'absence'>;
  note?: string;
}

/**
 * Builds a §5 Evidence entry with the excerpt guaranteed redacted. This is
 * the only sanctioned way to turn raw repository content into evidence.
 */
export function buildEvidence(params: BuildEvidenceParams): Evidence {
  return {
    path: params.path,
    startLine: params.startLine,
    endLine: params.endLine,
    excerpt: redactForPath(params.path, params.rawExcerpt),
    kind: params.kind,
    ...(params.note !== undefined ? { note: params.note } : {}),
  };
}

export interface BuildAbsenceEvidenceParams {
  /** Location searched. */
  path: string;
  /** What was expected but not found (§5 requires a non-empty note). */
  note: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Builds §5 `absence` evidence: an empty excerpt documenting a
 * searched-but-missing signal. Used by detectors reasoning about a missing
 * signal (e.g. no signature verification, no production URL mapping).
 */
export function buildAbsenceEvidence(params: BuildAbsenceEvidenceParams): Evidence {
  return {
    path: params.path,
    startLine: params.startLine ?? 0,
    endLine: params.endLine ?? 0,
    excerpt: '',
    kind: 'absence',
    note: params.note,
  };
}
