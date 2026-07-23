/**
 * LG-001 — Production callbacks using localhost (§3).
 *
 * Deterministic (Layer D, External = No). Scans **production-designated
 * configuration** — `.env.production*` files and `vercel.json` — for URL
 * values that resolve to a development origin (`localhost`, `127.0.0.1`, or a
 * `http://` scheme).
 *
 * Outcomes (§3):
 * - `fail` (confirmed, 1.0) when a production-designated URL value resolves to
 *   a development origin.
 * - `pass` when production URL mappings are present and all resolve to
 *   non-development origins.
 * - `unknown` when **no production URL mapping can be located** — the spec is
 *   explicit that we do not fabricate a fail here.
 *
 * Scope note (judgment call): "hardcoded in source on production paths" (§3)
 * is intentionally *not* scanned in this slice. Source URL literals are
 * dominated by the dev-fallback idiom (`process.env.X || 'http://localhost'`),
 * which would generate false positives; LG-001 here is limited to the two
 * concrete production-config carriers, which fully cover the seeded defect and
 * the required distractor (a `.env.development` localhost must not trip).
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence, isEnvFile } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { basename, makeFinding } from './detectorKit.js';

const DEV_ORIGIN_RE = /localhost|127\.0\.0\.1|http:\/\//i;
const URL_KEY_RE = /url|uri|origin|callback|redirect|webhook|site|endpoint|base/i;
const SCHEME_RE = /:\/\//;

/** A file is production-designated config iff it is vercel.json or `.env.production*`. */
function isProductionConfig(path: string): boolean {
  const b = basename(path);
  return b === 'vercel.json' || b.startsWith('.env.production');
}

interface LineVerdict {
  /** The line carries a URL mapping (has a scheme or a URL-ish key). */
  url: boolean;
  /** The URL value resolves to a development origin. */
  dev: boolean;
}

function evaluateLine(line: string, env: boolean): LineVerdict {
  if (env) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=(.*)$/.exec(line);
    if (m === null) return { url: false, dev: false };
    const key = m[1] ?? '';
    const value = m[2] ?? '';
    const url = URL_KEY_RE.test(key) || SCHEME_RE.test(value);
    return { url, dev: url && DEV_ORIGIN_RE.test(value) };
  }
  // JSON config (vercel.json): a localhost/http:// string value is a URL.
  const url = SCHEME_RE.test(line) || URL_KEY_RE.test(line);
  return { url, dev: url && DEV_ORIGIN_RE.test(line) };
}

export function detectLg001(fileset: Fileset): Finding[] {
  const prodFiles = fileset.files.filter((f) => isProductionConfig(f.path));

  const failEvidence: Evidence[] = [];
  let sawUrlMapping = false;
  let firstGoodUrl: Evidence | null = null;

  for (const file of prodFiles) {
    const env = isEnvFile(file.path);
    const lines = fileLines(file);
    lines.forEach((line, i) => {
      const verdict = evaluateLine(line, env);
      if (!verdict.url) return;
      sawUrlMapping = true;
      if (verdict.dev) {
        failEvidence.push(
          buildEvidence({
            path: file.path,
            startLine: i + 1,
            endLine: i + 1,
            rawExcerpt: line,
            kind: 'config',
            note: 'Production-designated URL value resolves to a development origin (localhost / 127.0.0.1 / http://).',
          }),
        );
      } else if (firstGoodUrl === null) {
        firstGoodUrl = buildEvidence({
          path: file.path,
          startLine: i + 1,
          endLine: i + 1,
          rawExcerpt: line,
          kind: 'config',
          note: 'Production URL mapping resolves to a non-development origin.',
        });
      }
    });
  }

  if (failEvidence.length > 0) {
    return [
      makeFinding({
        checkId: 'LG-001',
        seq: 1,
        outcome: 'fail',
        summary:
          'A production-designated configuration value resolves to a development origin (localhost / 127.0.0.1 / http://).',
        evidence: failEvidence,
      }),
    ];
  }

  if (sawUrlMapping && firstGoodUrl !== null) {
    return [
      makeFinding({
        checkId: 'LG-001',
        seq: 1,
        outcome: 'pass',
        summary: 'Production URL mappings resolve to non-development origins.',
        evidence: [firstGoodUrl],
      }),
    ];
  }

  // §3: no production URL mapping locatable → unknown (never a fabricated fail).
  const searched = prodFiles.length > 0 ? (prodFiles[0]?.path ?? '.env.production') : '.env.production';
  return [
    makeFinding({
      checkId: 'LG-001',
      seq: 1,
      outcome: 'unknown',
      summary: 'No production URL mapping could be located to evaluate for development origins.',
      evidence: [
        buildAbsenceEvidence({
          path: searched,
          note: 'Searched production-designated configuration (.env.production*, vercel.json); no production URL mapping was located.',
        }),
      ],
    }),
  ];
}
