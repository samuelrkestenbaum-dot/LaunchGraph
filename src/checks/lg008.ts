/**
 * LG-008 — Preview deployment using production database (§3, External = Partial).
 *
 * Deterministic (Layer D). Detects repository evidence that preview/dev
 * deployments may share a production database. The full scoping picture — the
 * actual environment variables a preview deployment receives at build/run time
 * — lives in the provider/Vercel dashboard and is external, so this check is
 * `partial`.
 *
 * Outcomes (P-003-S3 contract):
 * - `not_applicable` — no database usage is detected at all.
 * - `fail` (confirmed, blocker, NO externalVerification) — the repository
 *   PROVES the mixing: the identical concrete remote database URL value is
 *   committed under BOTH a production scope (`.env.production*`) and a
 *   non-production/all-deployments scope (`.env.{preview,development,local,
 *   test}*`, a plain `.env`, or a `vercel.json` env block). Because the
 *   collision is repository-provable it is `confirmed` and carries no external
 *   marker.
 * - `unknown` (unverified, + externalVerification{supabase,…}) — database
 *   usage is present but the repository cannot PROVE the scoping: it references
 *   env-var names without deployment-specific values, or the concrete values
 *   do not collide across production and non-production scopes. We never infer
 *   provider-side env values we cannot see; a merely-suggestive signal becomes
 *   `unknown`, NEVER an inferred low-confidence blocker.
 *
 * Deterministic-only slice narrowing (disclosed): the "hardcoded production DB
 * host reused for previews" signal (§3) is treated as suggestive, not proof —
 * a source host cannot be shown to reach a preview deployment from the
 * repository alone, so it routes to the `unknown` branch rather than `fail`.
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence, isEnvFile } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { basename, firstLineMatching, makeExternalVerification, makeFinding } from './detectorKit.js';

/** Any signal that the repository talks to a database at all (the applicability gate). */
const DB_USAGE_RE = /@supabase\/|createClient\s*\(|\bSUPABASE_[A-Z0-9_]+|\b(?:DATABASE|POSTGRES|POSTGRESQL|DIRECT)_URL\b|\.supabase\.co/i;

/** Deployment scope a config file maps to. */
type Scope = 'prod' | 'nonprod' | 'plain' | 'vercel';

function fileScope(path: string): Scope | null {
  const b = basename(path);
  if (b.startsWith('.env.production')) return 'prod';
  if (
    b.startsWith('.env.preview') ||
    b.startsWith('.env.development') ||
    b.startsWith('.env.local') ||
    b.startsWith('.env.test')
  ) {
    return 'nonprod';
  }
  if (b === '.env') return 'plain';
  if (b === 'vercel.json') return 'vercel';
  return null;
}

/** A key naming a database connection URL. */
function isDbUrlKey(key: string): boolean {
  const k = key.toUpperCase();
  return /(?:DATABASE|SUPABASE|POSTGRES|POSTGRESQL|DIRECT)/.test(k) && k.includes('URL');
}

/**
 * The lowercased host of a *concrete remote* database URL value, or null when
 * the value is a placeholder, an env reference, or a local origin. Used only
 * to qualify a value as remote; equality is compared on the full value.
 */
function concreteRemoteHost(value: string): string | null {
  const v = value.trim();
  if (v.includes('${') || v.includes('process.env')) return null; // an env reference, not a concrete value
  const m = /:\/\/([^/\s'"`)]+)/.exec(v);
  if (m === null) return null;
  let host = m[1] ?? '';
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  host = host.replace(/:\d+$/, '').toLowerCase();
  if (host === '' || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return null;
  return host;
}

interface DbAssignment {
  path: string;
  lineNo: number; // 1-based
  line: string;
  scope: Scope;
  value: string; // trimmed, concrete remote
}

/** Parses a `KEY=value` (env) or `"KEY": "value"` (vercel.json) DB-URL assignment. */
function parseAssignment(path: string, line: string): { key: string; value: string } | null {
  if (isEnvFile(path)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
    return m === null ? null : { key: m[1] ?? '', value: m[2] ?? '' };
  }
  const m = /"([A-Za-z_][A-Za-z0-9_.]*)"\s*:\s*"([^"]*)"/.exec(line);
  return m === null ? null : { key: m[1] ?? '', value: m[2] ?? '' };
}

function collectAssignments(fileset: Fileset): DbAssignment[] {
  const assignments: DbAssignment[] = [];
  for (const file of fileset.files) {
    const scope = fileScope(file.path);
    if (scope === null) continue;
    fileLines(file).forEach((line, i) => {
      const parsed = parseAssignment(file.path, line);
      if (parsed === null || !isDbUrlKey(parsed.key)) return;
      const host = concreteRemoteHost(parsed.value);
      if (host === null) return;
      assignments.push({ path: file.path, lineNo: i + 1, line, scope, value: parsed.value.trim() });
    });
  }
  return assignments;
}

/**
 * A concrete remote value proves mixing when it appears under a production
 * scope AND under a non-production/all-deployments scope (the same database
 * serving preview and production).
 */
function provesMixing(scopes: Set<Scope>): boolean {
  const productionScoped = scopes.has('prod');
  const previewScoped = scopes.has('nonprod') || scopes.has('plain') || scopes.has('vercel');
  return productionScoped && previewScoped;
}

export function detectLg008(fileset: Fileset): Finding[] {
  const usageFile = fileset.files.find((f) => DB_USAGE_RE.test(f.content));
  if (usageFile === undefined) {
    return [
      makeFinding({
        checkId: 'LG-008',
        seq: 1,
        outcome: 'not_applicable',
        summary: 'No database usage detected; the preview-database check does not apply.',
        evidence: [],
      }),
    ];
  }

  const assignments = collectAssignments(fileset);
  const byValue = new Map<string, DbAssignment[]>();
  for (const a of assignments) {
    const group = byValue.get(a.value) ?? [];
    group.push(a);
    byValue.set(a.value, group);
  }

  const mixing: DbAssignment[] = [];
  for (const group of byValue.values()) {
    if (provesMixing(new Set(group.map((a) => a.scope)))) mixing.push(...group);
  }

  if (mixing.length > 0) {
    const evidence: Evidence[] = mixing.map((a) =>
      buildEvidence({
        path: a.path,
        startLine: a.lineNo,
        endLine: a.lineNo,
        rawExcerpt: a.line,
        kind: 'config',
        note: 'The same database URL value is committed under both production and non-production deployment scopes — preview deployments share the production database.',
      }),
    );
    return [
      makeFinding({
        checkId: 'LG-008',
        seq: 1,
        outcome: 'fail',
        summary:
          'The same database URL value serves both production and a non-production (preview/dev) scope; preview deployments use the production database.',
        evidence,
      }),
    ];
  }

  // DB usage present, but no repository-provable cross-environment collision:
  // the scoping picture lives in the provider dashboard (external — Phase 3).
  const idx = firstLineMatching(fileLines(usageFile), DB_USAGE_RE);
  const lineNo = idx >= 0 ? idx + 1 : 1;
  return [
    makeFinding({
      checkId: 'LG-008',
      seq: 1,
      outcome: 'unknown',
      classification: 'unverified',
      summary:
        'Database usage is present but the repository does not pin deployment-specific values; whether preview and production database scoping is separated cannot be established from the repository (external — Phase 3).',
      evidence: [
        buildAbsenceEvidence({
          path: usageFile.path,
          note: 'Database usage detected, but no repository-provable cross-environment value collision was found; preview/production database scoping lives in the provider dashboard (external — Phase 3).',
        }),
        buildEvidence({
          path: usageFile.path,
          startLine: lineNo,
          endLine: lineNo,
          rawExcerpt: fileLines(usageFile)[Math.max(0, lineNo - 1)] ?? '',
          kind: basename(usageFile.path).startsWith('.env') ? 'config' : 'code',
          note: 'Database usage reference; deployment-specific values are not pinned in the repository.',
        }),
      ],
      externalVerification: makeExternalVerification(
        'supabase',
        'preview and production database scoping is separated in the provider dashboard',
      ),
    }),
  ];
}
