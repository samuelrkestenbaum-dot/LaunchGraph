/**
 * LG-010 — Unauthenticated email domain (§3, Warning, External = Yes).
 *
 * Deterministic (Layer D). Repository analysis can only establish which
 * from-addresses the app SENDS from. Whether the sending domain is actually
 * authenticated (SPF/DKIM/DMARC published and verified at the email provider)
 * is external → Phase 3. This check NEVER claims a domain IS authenticated;
 * it reports only the repository-side signal and marks the provider side
 * `unverified` (§1.2).
 *
 * WARNING CEILING (§3): LG-010's severity ceiling is `warning`. A repo-side
 * problem is emitted as outcome `fail` + severity `warning` (the severity is
 * drawn from the §3 registry by makeFinding — never hardcoded), so a fixture
 * seeding only an LG-010 problem reaches `ready_with_warnings` (exit 0), NOT
 * `not_ready` (§7: the engine routes fail+warning to warnings, and rule 2/3
 * fire on blockers only).
 *
 * APPLICABILITY GATE: LG-010 evaluates only a repository that exhibits
 * Resend / transactional-email SENDING usage — an import of `resend`, a
 * `new Resend(...)`, an `.emails.send(...)` call, or an email template file.
 * With no such usage the check returns `not_applicable` (no
 * externalVerification, empty evidence), so it never raises a spurious finding
 * on a stack that sends no email.
 *
 * Outcomes (§3 and the P-003-S3 externalVerification contract):
 * - `not_applicable` — no email-sending usage.
 * - `fail` (confirmed, warning) — a from-address uses a PROVIDER DEFAULT
 *   sending domain (e.g. `onboarding@resend.dev`) OR a from-domain that is
 *   mismatched with the configured production domain. Evidence cites the
 *   offending from-address line. externalVerification{resend,…,phase-3} is
 *   attached: authenticating the sending domain is external.
 * - `pass` (unverified, confidence 1.0) — a plausible custom from-domain is
 *   used (and it either matches the production domain or the production domain
 *   cannot be determined). The SAME externalVerification marker is attached;
 *   this pass-unverified case holds the Phase-1 ceiling at `ready_with_warnings`
 *   (§7 rule 6). We NEVER claim the domain IS authenticated — that is external.
 *
 * DISCLOSED NARROWING (judgment calls, mirroring lg015's disclosed gate):
 * - Production-domain derivation. The canonical production host is derived the
 *   way lg015 derives it — canonical-URL keys in `.env.production*`/`.env`/
 *   `vercel.json` plus a source `metadataBase`. lg015's helpers are not
 *   exported and lg015 is frozen this slice, so that logic is re-implemented
 *   locally here. Only a SINGLE distinct canonical host is used for the
 *   mismatch comparison; if zero or multiple hosts are configured the
 *   production domain is treated as indeterminable and the mismatch test is
 *   skipped (the provider-default test still applies).
 * - Registrable-domain comparison uses a simple last-two-labels heuristic (no
 *   public-suffix list), so a `mail.example.com` sender is treated as matching
 *   an `app.example.com` production host. Multi-part TLDs (`.co.uk`) are out of
 *   scope for this deterministic slice.
 * - When email-sending usage exists but no literal from-address can be
 *   extracted, or a custom from-domain is used with an indeterminable
 *   production domain, the check DEFAULTS to `pass` (unverified) — it never
 *   fabricates a fail, and never asserts authentication.
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { buildEvidence, isEnvFile } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { basename, firstLineMatching, makeExternalVerification, makeFinding } from './detectorKit.js';

const CODE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/** Resend / transactional-email SENDING usage — the applicability gate. */
const RESEND_USAGE_RE =
  /from\s+['"]resend['"]|require\(\s*['"]resend['"]\s*\)|new\s+Resend\s*\(|\.emails\.send\s*\(/;

/** A `from:` object field carrying a quoted string value (a Resend send call / template). */
const FROM_FIELD_RE = /\bfrom\s*:\s*['"`]([^'"`]*)['"`]/;
/** An email address inside a from value; group 1 is the domain. */
const EMAIL_ADDR_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/** A provider-default sending domain (Resend's shared sandbox). */
const PROVIDER_DEFAULT_DOMAIN_RE = /(?:^|\.)resend\.dev$/;

/** Canonical-URL derivation, mirroring lg015 (whose helpers are not exported). */
const NEXT_METADATA_BASE_RE = /metadataBase\s*[:=]\s*new\s+URL\(\s*['"`]([^'"`]+)['"`]/;
const CANONICAL_KEY_RE = /(?:SITE|CANONICAL|APP|NEXTAUTH|AUTH|BASE|FRONTEND|WEB|DOMAIN)[A-Z0-9_]*URL$|^URL$/;
const NON_DOMAIN_KEY_RE = /DATABASE|SUPABASE|POSTGRES|REDIS|MONGO|STRIPE|WEBHOOK|RESEND|SENTRY|DSN|POSTHOG|ANALYTICS/;

/** The external half is identical for the fail and pass-unverified branches. */
const EMAIL_DOMAIN_EXTERNAL = makeExternalVerification(
  'resend',
  'the sending domain is authenticated (SPF/DKIM/DMARC) at the email provider',
);

/** A template file is an email-from carrier by path even without a send call. */
function isEmailTemplateFile(path: string): boolean {
  const lower = path.toLowerCase();
  return /(?:^|\/)emails?\//.test(lower) || /\.email\.(?:tsx?|jsx?|html)$/.test(lower);
}

/** A production-designated carrier of a canonical domain (dev/preview files excluded). */
function isProdDomainCarrier(path: string): boolean {
  const b = basename(path);
  return b.startsWith('.env.production') || b === '.env' || b === 'vercel.json';
}

/** Lowercased registrable domain: the last two dot-labels (no public-suffix list). */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.').filter((l) => l.length > 0);
  return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.');
}

/**
 * Extracts a lowercased host from a configured URL value (scheme optional).
 * Returns null for env references, placeholders, or non-URL values. Mirrors
 * lg015's extractHost.
 */
function extractHost(value: string): string | null {
  const v = value.trim().replace(/^['"`]/, '').replace(/['"`]$/, '');
  if (v === '' || v.includes('${') || v.includes('process.env')) return null;
  let rest = v;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(rest);
  if (scheme !== null) {
    rest = rest.slice(scheme[0].length);
  } else if (!/^[a-z0-9.-]+\.[a-z]{2,}/i.test(rest)) {
    return null;
  }
  let host = rest.split(/[/?#]/)[0] ?? '';
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  host = host.replace(/:\d+$/, '').toLowerCase();
  return host === '' ? null : host;
}

/**
 * Derives THE single canonical production host, or null when zero or multiple
 * distinct hosts are configured (indeterminable). Mirrors lg015's collection
 * over `.env.production*`/`.env`/`vercel.json` canonical keys plus a source
 * `metadataBase`.
 */
function deriveProdHost(fileset: Fileset): string | null {
  const hosts = new Set<string>();
  for (const file of fileset.files) {
    if (isProdDomainCarrier(file.path)) {
      const env = isEnvFile(file.path);
      for (const line of fileLines(file)) {
        let key = '';
        let value = '';
        if (env) {
          const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
          if (m === null) continue;
          key = m[1] ?? '';
          value = m[2] ?? '';
        } else {
          const m = /"([A-Za-z_][A-Za-z0-9_.]*)"\s*:\s*"([^"]*)"/.exec(line);
          if (m === null) continue;
          key = m[1] ?? '';
          value = m[2] ?? '';
        }
        const k = key.toUpperCase();
        if (!CANONICAL_KEY_RE.test(k) || NON_DOMAIN_KEY_RE.test(k)) continue;
        const host = extractHost(value);
        if (host !== null) hosts.add(host);
      }
    }
    if (CODE_EXT_RE.test(file.path)) {
      for (const line of fileLines(file)) {
        const m = NEXT_METADATA_BASE_RE.exec(line);
        if (m === null) continue;
        const host = extractHost(m[1] ?? '');
        if (host !== null) hosts.add(host);
      }
    }
  }
  return hosts.size === 1 ? ([...hosts][0] ?? null) : null;
}

interface FromSite {
  path: string;
  lineNo: number; // 1-based
  line: string;
  domain: string; // lowercased
  kind: 'code' | 'config';
}

/** Every from-address carried by a `from:` field in a code or template file. */
function collectFromSites(fileset: Fileset): FromSite[] {
  const sites: FromSite[] = [];
  for (const file of fileset.files) {
    const isCode = CODE_EXT_RE.test(file.path);
    if (!isCode && !isEmailTemplateFile(file.path)) continue;
    fileLines(file).forEach((line, i) => {
      const fm = FROM_FIELD_RE.exec(line);
      if (fm === null) return;
      const em = EMAIL_ADDR_RE.exec(fm[1] ?? '');
      if (em === null) return;
      sites.push({
        path: file.path,
        lineNo: i + 1,
        line,
        domain: (em[1] ?? '').toLowerCase(),
        kind: isCode ? 'code' : 'config',
      });
    });
  }
  return sites;
}

/** The first email-sending usage line, for pass-branch evidence when no from-address is extractable. */
function findUsageSite(fileset: Fileset): { path: string; lineNo: number; line: string; kind: 'code' | 'config' } | null {
  for (const file of fileset.files) {
    const idx = firstLineMatching(fileLines(file), RESEND_USAGE_RE);
    if (idx >= 0) {
      return { path: file.path, lineNo: idx + 1, line: fileLines(file)[idx] ?? '', kind: CODE_EXT_RE.test(file.path) ? 'code' : 'config' };
    }
  }
  const tmpl = fileset.files.find((f) => isEmailTemplateFile(f.path));
  if (tmpl !== undefined) {
    return { path: tmpl.path, lineNo: 1, line: fileLines(tmpl)[0] ?? '', kind: CODE_EXT_RE.test(tmpl.path) ? 'code' : 'config' };
  }
  return null;
}

export function detectLg010(fileset: Fileset): Finding[] {
  const hasUsage =
    fileset.files.some((f) => RESEND_USAGE_RE.test(f.content)) ||
    fileset.files.some((f) => isEmailTemplateFile(f.path));
  if (!hasUsage) {
    return [
      makeFinding({
        checkId: 'LG-010',
        seq: 1,
        outcome: 'not_applicable',
        summary: 'No transactional-email (Resend) sending usage detected; the email-domain check does not apply.',
        evidence: [],
      }),
    ];
  }

  const sites = collectFromSites(fileset);
  const prodHost = deriveProdHost(fileset);
  const prodRegistrable = prodHost === null ? null : registrableDomain(prodHost);

  const failSite = sites.find((s) => {
    if (PROVIDER_DEFAULT_DOMAIN_RE.test(s.domain)) return true;
    return prodRegistrable !== null && registrableDomain(s.domain) !== prodRegistrable;
  });

  if (failSite !== undefined) {
    const isDefault = PROVIDER_DEFAULT_DOMAIN_RE.test(failSite.domain);
    const note = isDefault
      ? 'Email is sent from a provider-default domain (a shared, unauthenticated sending domain); whether a custom sending domain is authenticated (SPF/DKIM/DMARC) is external — Phase 3.'
      : `Email is sent from a from-domain (${failSite.domain}) that does not match the configured production domain; whether the sending domain is authenticated (SPF/DKIM/DMARC) is external — Phase 3.`;
    return [
      makeFinding({
        checkId: 'LG-010',
        seq: 1,
        outcome: 'fail',
        summary: isDefault
          ? 'The app sends email from a provider-default (shared, unauthenticated) sending domain; whether a sending domain is authenticated at the provider is external and unverified (Phase 3).'
          : 'The app sends email from a domain that does not match the configured production domain; whether that sending domain is authenticated at the provider is external and unverified (Phase 3).',
        evidence: [
          buildEvidence({
            path: failSite.path,
            startLine: failSite.lineNo,
            endLine: failSite.lineNo,
            rawExcerpt: failSite.line,
            kind: failSite.kind,
            note,
          }),
        ],
        externalVerification: EMAIL_DOMAIN_EXTERNAL,
      }),
    ];
  }

  // Pass-unverified: a plausible custom from-domain (or usage with no extractable
  // from-address). We never assert the domain IS authenticated — that is external.
  const passSite = sites[0] ?? null;
  const evidence: Evidence[] = [];
  if (passSite !== null) {
    evidence.push(
      buildEvidence({
        path: passSite.path,
        startLine: passSite.lineNo,
        endLine: passSite.lineNo,
        rawExcerpt: passSite.line,
        kind: passSite.kind,
        note: 'Custom from-domain used for sending (presence only; SPF/DKIM/DMARC authentication at the provider is external — Phase 3).',
      }),
    );
  } else {
    const usage = findUsageSite(fileset);
    if (usage !== null) {
      evidence.push(
        buildEvidence({
          path: usage.path,
          startLine: usage.lineNo,
          endLine: usage.lineNo,
          rawExcerpt: usage.line,
          kind: usage.kind,
          note: 'Email-sending usage present without an extractable literal from-address; sending-domain authentication is external — Phase 3.',
        }),
      );
    }
  }
  return [
    makeFinding({
      checkId: 'LG-010',
      seq: 1,
      outcome: 'pass',
      classification: 'unverified',
      summary:
        'The app sends email from a custom domain; whether that sending domain is authenticated (SPF/DKIM/DMARC) at the email provider is external and unverified (Phase 3).',
      evidence,
      externalVerification: EMAIL_DOMAIN_EXTERNAL,
    }),
  ];
}
