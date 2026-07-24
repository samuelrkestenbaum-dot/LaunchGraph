/**
 * LG-015 — Missing or unverified production domain (§3, External = Yes).
 *
 * Deterministic (Layer D). Repository analysis can only establish whether a
 * canonical production URL is CONFIGURED and internally consistent. It can
 * NEVER establish that the domain is registered, that DNS resolves, that TLS
 * is valid, that ownership is proven, that redirects work, or that the domain
 * is attached to the deployment — all of that is external (Phase 3). The
 * finding and its note state this limitation explicitly. No DNS queries are
 * ever performed (§10 SEC-2).
 *
 * APPLICABILITY GATE (disclosed judgment call, mirroring lg001's narrowing):
 * LG-015 only evaluates a repository that carries an app signal — a `next`
 * dependency, an app/ or pages/ router, a `vercel.json`, or a `metadataBase`.
 * A non-app repository (e.g. the unsupported plain-Express fixture) returns
 * `not_applicable`, so the deterministic slice never raises a spurious
 * missing-domain blocker on a stack it does not support.
 *
 * Outcomes (§3 and the P-003-S3 externalVerification contract):
 * - `not_applicable` — no app signal.
 * - `fail` (confirmed, blocker) — NO canonical production URL is configured
 *   anywhere, OR configured canonical URLs disagree on the host. Evidence is
 *   an `absence` entry (listing the searched carriers) or the disagreeing
 *   lines. A documentary externalVerification{dns,…,phase-3} is attached.
 * - `pass` (unverified, confidence 1.0) — a single canonical production host
 *   is configured and consistent. The SAME externalVerification marker is
 *   attached; this pass-unverified case holds the Phase-1 ceiling at
 *   `ready_with_warnings` (§7 rule 6). Whether the configured host is a
 *   DEVELOPMENT origin is LG-001's concern, not LG-015's — the two do not
 *   overlap: LG-015 asks only whether SOME canonical host is present and
 *   agreed upon.
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence, isEnvFile } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { basename, makeExternalVerification, makeFinding } from './detectorKit.js';

const CODE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const NEXT_DEP_RE = /"next"\s*:/;
const APP_ROUTER_RE = /(^|\/)app\/.+\/(route|page|layout)\.(?:t|j)sx?$/;
const PAGES_ROUTER_RE = /(^|\/)pages\//;
const METADATA_BASE_RE = /metadataBase\s*[:=]\s*new\s+URL\(\s*['"`]([^'"`]+)['"`]/;

/** A canonical site/app/auth URL key (not a provider or database URL key). */
const CANONICAL_KEY_RE = /(?:SITE|CANONICAL|APP|NEXTAUTH|AUTH|BASE|FRONTEND|WEB|DOMAIN)[A-Z0-9_]*URL$|^URL$/;
const NON_DOMAIN_KEY_RE = /DATABASE|SUPABASE|POSTGRES|REDIS|MONGO|STRIPE|WEBHOOK|RESEND|SENTRY|DSN|POSTHOG|ANALYTICS/;

/** The dns external half is identical for the fail and pass-unverified branches. */
const DOMAIN_EXTERNAL = makeExternalVerification(
  'dns',
  'the configured production domain resolves via DNS with valid TLS and is attached to the deployment',
);

/** A production-designated carrier of a canonical domain (dev/preview files are excluded). */
function isProdDomainCarrier(path: string): boolean {
  const b = basename(path);
  return b.startsWith('.env.production') || b === '.env' || b === 'vercel.json';
}

function isCanonicalKey(key: string): boolean {
  const k = key.toUpperCase();
  return CANONICAL_KEY_RE.test(k) && !NON_DOMAIN_KEY_RE.test(k);
}

/**
 * Extracts a lowercased host from a configured URL value, keeping any scheme
 * and origin (http/localhost included — presence, not correctness, is what
 * LG-015 measures). Returns null for env references or non-URL values.
 */
function extractHost(value: string): string | null {
  const v = value.trim().replace(/^['"`]/, '').replace(/['"`]$/, '');
  if (v === '' || v.includes('${') || v.includes('process.env')) return null;
  let rest = v;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(rest);
  if (scheme !== null) {
    rest = rest.slice(scheme[0].length);
  } else if (!/^[a-z0-9.-]+\.[a-z]{2,}/i.test(rest)) {
    return null; // a bare value must at least look like a domain
  }
  let host = rest.split(/[/?#]/)[0] ?? '';
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  host = host.replace(/:\d+$/, '').toLowerCase();
  return host === '' ? null : host;
}

interface HostSite {
  path: string;
  lineNo: number; // 1-based
  line: string;
  host: string;
  kind: 'code' | 'config';
}

function hasAppSignal(fileset: Fileset): boolean {
  const pkg = fileset.files.find((f) => basename(f.path) === 'package.json');
  if (pkg !== undefined && NEXT_DEP_RE.test(pkg.content)) return true;
  if (fileset.files.some((f) => APP_ROUTER_RE.test(f.path))) return true;
  if (fileset.files.some((f) => PAGES_ROUTER_RE.test(f.path))) return true;
  if (fileset.files.some((f) => basename(f.path) === 'vercel.json')) return true;
  if (fileset.files.some((f) => CODE_EXT_RE.test(f.path) && METADATA_BASE_RE.test(f.content))) return true;
  return false;
}

/** Collects every configured canonical-production-URL host across the searched carriers. */
function collectHostSites(fileset: Fileset): HostSite[] {
  const sites: HostSite[] = [];
  for (const file of fileset.files) {
    if (isProdDomainCarrier(file.path)) {
      const env = isEnvFile(file.path);
      fileLines(file).forEach((line, i) => {
        let key = '';
        let value = '';
        if (env) {
          const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
          if (m === null) return;
          key = m[1] ?? '';
          value = m[2] ?? '';
        } else {
          const m = /"([A-Za-z_][A-Za-z0-9_.]*)"\s*:\s*"([^"]*)"/.exec(line);
          if (m === null) return;
          key = m[1] ?? '';
          value = m[2] ?? '';
        }
        if (!isCanonicalKey(key)) return;
        const host = extractHost(value);
        if (host === null) return;
        sites.push({ path: file.path, lineNo: i + 1, line, host, kind: 'config' });
      });
    }
    if (CODE_EXT_RE.test(file.path)) {
      fileLines(file).forEach((line, i) => {
        const m = METADATA_BASE_RE.exec(line);
        if (m === null) return;
        const host = extractHost(m[1] ?? '');
        if (host === null) return;
        sites.push({ path: file.path, lineNo: i + 1, line, host, kind: 'code' });
      });
    }
  }
  return sites;
}

export function detectLg015(fileset: Fileset): Finding[] {
  if (!hasAppSignal(fileset)) {
    return [
      makeFinding({
        checkId: 'LG-015',
        seq: 1,
        outcome: 'not_applicable',
        summary:
          'No app signal (Next.js dependency, app/pages router, vercel.json, or metadataBase) detected; the production-domain check does not apply.',
        evidence: [],
      }),
    ];
  }

  const sites = collectHostSites(fileset);
  const hosts = new Set(sites.map((s) => s.host));

  if (hosts.size === 0) {
    const carriers = fileset.files.filter((f) => isProdDomainCarrier(f.path)).map((f) => f.path);
    const searched =
      carriers[0] ??
      fileset.files.find((f) => basename(f.path) === 'package.json')?.path ??
      fileset.files[0]?.path ??
      'package.json';
    return [
      makeFinding({
        checkId: 'LG-015',
        seq: 1,
        outcome: 'fail',
        summary:
          'No canonical production URL is configured anywhere in the repository; repository analysis cannot establish that a production domain exists, resolves via DNS, or has valid TLS (external — Phase 3).',
        evidence: [
          buildAbsenceEvidence({
            path: searched,
            note: 'Searched production-designated configuration (.env.production*, .env, vercel.json) and source metadataBase for a canonical production URL; none was configured. DNS resolution, TLS, ownership, and deployment attachment are external — Phase 3.',
          }),
        ],
        externalVerification: DOMAIN_EXTERNAL,
      }),
    ];
  }

  if (hosts.size >= 2) {
    const seen = new Set<string>();
    const evidence: Evidence[] = [];
    for (const s of sites) {
      if (seen.has(s.host)) continue;
      seen.add(s.host);
      evidence.push(
        buildEvidence({
          path: s.path,
          startLine: s.lineNo,
          endLine: s.lineNo,
          rawExcerpt: s.line,
          kind: s.kind,
          note: 'Configured canonical production URL — disagrees with another configured canonical host.',
        }),
      );
    }
    return [
      makeFinding({
        checkId: 'LG-015',
        seq: 1,
        outcome: 'fail',
        summary:
          'Configured canonical production URLs disagree on the host; repository analysis cannot determine the intended production domain (DNS/TLS/attachment are external — Phase 3).',
        evidence,
        externalVerification: DOMAIN_EXTERNAL,
      }),
    ];
  }

  const site = sites[0];
  const passEvidence: Evidence[] =
    site === undefined
      ? []
      : [
          buildEvidence({
            path: site.path,
            startLine: site.lineNo,
            endLine: site.lineNo,
            rawExcerpt: site.line,
            kind: site.kind,
            note: 'Configured canonical production URL (presence and consistency only; DNS resolution, TLS, and deployment attachment are external — Phase 3).',
          }),
        ];
  return [
    makeFinding({
      checkId: 'LG-015',
      seq: 1,
      outcome: 'pass',
      classification: 'unverified',
      summary:
        'A canonical production URL is configured and internally consistent; whether the domain resolves via DNS, has valid TLS, and is attached to the deployment is external and unverified (Phase 3).',
      evidence: passEvidence,
      externalVerification: DOMAIN_EXTERNAL,
    }),
  ];
}
