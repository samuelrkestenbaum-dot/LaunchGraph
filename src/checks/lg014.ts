/**
 * LG-014 — Sentry installed but unverified in production (§3, Warning, External = Yes).
 *
 * Deterministic (Layer D). Repository analysis can only establish whether the
 * Sentry SDK is INSTALLED and CONFIGURED for production (a DSN wired and
 * environment/release tagging set). Whether errors actually ARRIVE in the
 * production Sentry project with correct tagging is external → Phase 3. This
 * check NEVER claims events actually arrive; it reports the repository-side
 * configuration and marks the provider side `unverified` (§1.2).
 *
 * WARNING CEILING (§3): LG-014's severity ceiling is `warning`. A repo-side
 * problem is emitted as outcome `fail` + severity `warning` (drawn from the §3
 * registry by makeFinding — never hardcoded), so a fixture seeding only an
 * LG-014 problem reaches `ready_with_warnings` (exit 0), NOT `not_ready` (§7:
 * fail+warning routes to warnings; rule 2/3 fire on blockers only).
 *
 * APPLICABILITY GATE: LG-014 evaluates only a repository that exhibits Sentry
 * usage — an `@sentry/*` dependency or import, a `Sentry.init(...)` call, or a
 * `sentry.*.config.*` file. With no such usage the check returns
 * `not_applicable` (no externalVerification, empty evidence).
 *
 * "UNVERIFIED IN PRODUCTION" — the exact repository-side criteria implemented:
 * the Sentry configuration is considered production-wired when BOTH hold —
 *  (1) a DSN is wired: a `dsn:` field carrying a non-empty value in a Sentry
 *      config site (a `Sentry.init(...)` call or a `sentry.*.config.*` file),
 *      OR a production-carrier env key containing `DSN` with a value; AND
 *  (2) environment/release tagging is configured: an `environment:` or
 *      `release:` field carrying a non-empty value in a Sentry config site.
 * A `dsn:`/`environment:`/`release:` field whose value is an env reference
 * (`process.env.SENTRY_DSN`) COUNTS as wired — the repository cannot see the
 * provider dashboard, and the honest repository-side statement is "wired,
 * arrival unverified", not "absent".
 *
 * Outcomes (§3 and the P-003-S3 externalVerification contract):
 * - `not_applicable` — no Sentry usage.
 * - `fail` (confirmed, warning) — the SDK is present but the DSN is absent from
 *   production configuration OR no environment/release tagging is configured.
 *   Evidence cites the Sentry config site plus an `absence` entry stating what
 *   was searched. externalVerification{sentry,…,phase-3} is attached.
 * - `pass` (unverified, confidence 1.0) — SDK + DSN + environment/release
 *   tagging are all wired. The SAME externalVerification marker is attached;
 *   this pass-unverified case holds the Phase-1 ceiling at `ready_with_warnings`
 *   (§7 rule 6). We NEVER claim events actually arrive — that is external.
 */
import { fileLines } from '../scan/collect.js';
import type { CollectedFile, Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence, isEnvFile } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { basename, firstLineMatching, makeExternalVerification, makeFinding } from './detectorKit.js';

/** Sentry SDK usage — the applicability gate (dependency, import, or init call). */
const SENTRY_SDK_RE = /@sentry\/[a-z-]+|Sentry\.init\s*\(/;
/** A Sentry init call specifically (a config site). */
const SENTRY_INIT_RE = /Sentry\.init\s*\(/;

/** DSN / environment / release option fields inside a Sentry config object. */
const DSN_FIELD_RE = /\bdsn\s*:\s*(.+)$/i;
const ENVIRONMENT_FIELD_RE = /\benvironment\s*:\s*(.+)$/;
const RELEASE_FIELD_RE = /\brelease\s*:\s*(.+)$/;

/** The external half is identical for the fail and pass-unverified branches. */
const SENTRY_EXTERNAL = makeExternalVerification(
  'sentry',
  'errors actually arrive in the production Sentry project with correct environment/release tagging',
);

/** A Sentry config file by path, e.g. `sentry.server.config.ts`. */
function isSentryConfigFile(path: string): boolean {
  return /^sentry\..*config\.(?:t|j)sx?$/.test(basename(path));
}

/** A file where Sentry initialization/config lives (an init call or a config file). */
function isSentryConfigSite(file: CollectedFile): boolean {
  return isSentryConfigFile(file.path) || SENTRY_INIT_RE.test(file.content);
}

/** A production-designated carrier of a DSN env value. */
function isProdCarrier(path: string): boolean {
  const b = basename(path);
  return b.startsWith('.env.production') || b === '.env' || b === 'vercel.json';
}

/** True when a config-object field is present AND carries a non-empty, non-nullish value. */
function fieldHasValue(line: string, re: RegExp): boolean {
  const m = re.exec(line);
  if (m === null) return false;
  let v = (m[1] ?? '').trim();
  v = v.replace(/,\s*$/, '').trim();
  v = v.replace(/^['"`]/, '').replace(/['"`]$/, '').trim();
  return v !== '' && v !== 'undefined' && v !== 'null';
}

/** A DSN configured in production-designated env/config (a `*DSN*` key with a value). */
function prodDsnConfigured(fileset: Fileset): boolean {
  for (const file of fileset.files) {
    if (!isProdCarrier(file.path)) continue;
    const env = isEnvFile(file.path);
    for (const line of fileLines(file)) {
      let key = '';
      let value = '';
      if (env) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
        if (m === null) continue;
        key = m[1] ?? '';
        value = (m[2] ?? '').trim();
      } else {
        const m = /"([A-Za-z_][A-Za-z0-9_.]*)"\s*:\s*"([^"]*)"/.exec(line);
        if (m === null) continue;
        key = m[1] ?? '';
        value = (m[2] ?? '').trim();
      }
      if (/DSN/i.test(key) && value !== '') return true;
    }
  }
  return false;
}

/** The evidence site: prefer a Sentry config site; fall back to the SDK usage file. */
function evidenceSite(fileset: Fileset, configSites: CollectedFile[]): { file: CollectedFile; lineNo: number } | null {
  const site = configSites[0];
  if (site !== undefined) {
    const idx = firstLineMatching(fileLines(site), SENTRY_INIT_RE);
    return { file: site, lineNo: idx >= 0 ? idx + 1 : 1 };
  }
  const usage = fileset.files.find((f) => SENTRY_SDK_RE.test(f.content));
  if (usage !== undefined) {
    const idx = firstLineMatching(fileLines(usage), SENTRY_SDK_RE);
    return { file: usage, lineNo: idx >= 0 ? idx + 1 : 1 };
  }
  return null;
}

export function detectLg014(fileset: Fileset): Finding[] {
  const hasUsage =
    fileset.files.some((f) => SENTRY_SDK_RE.test(f.content)) ||
    fileset.files.some((f) => isSentryConfigFile(f.path));
  if (!hasUsage) {
    return [
      makeFinding({
        checkId: 'LG-014',
        seq: 1,
        outcome: 'not_applicable',
        summary: 'No Sentry usage detected; the production-monitoring check does not apply.',
        evidence: [],
      }),
    ];
  }

  const configSites = fileset.files.filter((f) => isSentryConfigSite(f));
  const dsnInInit = configSites.some((f) => fileLines(f).some((l) => fieldHasValue(l, DSN_FIELD_RE)));
  const dsnWired = dsnInInit || prodDsnConfigured(fileset);
  const taggingWired = configSites.some((f) =>
    fileLines(f).some((l) => fieldHasValue(l, ENVIRONMENT_FIELD_RE) || fieldHasValue(l, RELEASE_FIELD_RE)),
  );

  const site = evidenceSite(fileset, configSites);

  if (!dsnWired || !taggingWired) {
    const missing: string[] = [];
    if (!dsnWired) missing.push('a production DSN');
    if (!taggingWired) missing.push('environment/release tagging');
    const evidence: Evidence[] = [];
    if (site !== null) {
      evidence.push(
        buildEvidence({
          path: site.file.path,
          startLine: site.lineNo,
          endLine: site.lineNo,
          rawExcerpt: fileLines(site.file)[site.lineNo - 1] ?? '',
          kind: 'code',
          note: `Sentry is installed/initialized here but ${missing.join(' and ')} is not configured in the repository; whether events actually arrive in production Sentry is external — Phase 3.`,
        }),
      );
      evidence.push(
        buildAbsenceEvidence({
          path: site.file.path,
          note: `Searched Sentry configuration and production-designated config for ${missing.join(' and ')}; not found. Actual production event arrival with correct environment/release tagging is external — Phase 3.`,
        }),
      );
    }
    return [
      makeFinding({
        checkId: 'LG-014',
        seq: 1,
        outcome: 'fail',
        summary: `Sentry is installed but ${missing.join(' and ')} is absent from production configuration; whether errors actually arrive in the production Sentry project is external and unverified (Phase 3).`,
        evidence,
        externalVerification: SENTRY_EXTERNAL,
      }),
    ];
  }

  const passEvidence: Evidence[] =
    site === null
      ? []
      : [
          buildEvidence({
            path: site.file.path,
            startLine: site.lineNo,
            endLine: site.lineNo,
            rawExcerpt: fileLines(site.file)[site.lineNo - 1] ?? '',
            kind: 'code',
            note: 'Sentry is initialized with a DSN and environment/release tagging (repository wiring only; actual production event arrival is external — Phase 3).',
          }),
        ];
  return [
    makeFinding({
      checkId: 'LG-014',
      seq: 1,
      outcome: 'pass',
      classification: 'unverified',
      summary:
        'Sentry is installed with a DSN and environment/release tagging wired; whether errors actually arrive in the production Sentry project is external and unverified (Phase 3).',
      evidence: passEvidence,
      externalVerification: SENTRY_EXTERNAL,
    }),
  ];
}
