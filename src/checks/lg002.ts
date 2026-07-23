/**
 * LG-002 — Stripe test/live key mixing (§3).
 *
 * Deterministic (Layer D, External = No). Failures are `confirmed`. Signals:
 * - `sk_live`/`pk_live` (live secret/publishable) values committed **anywhere**
 *   — also a secret leak, so the evidence excerpt is redacted (SEC-4, §10).
 * - live keys mapped into development env files.
 * - `sk_test`/`pk_test` mapped into production configuration.
 * - a single unscoped key variable (a plain `.env`) serving all environments.
 *
 * All evidence is built through the redacting evidence builder, so no raw key
 * value can reach the Finding (§5 invariant).
 */
import { fileLines } from '../scan/collect.js';
import type { CollectedFile, Fileset } from '../scan/collect.js';
import { buildEvidence } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { basename, makeFinding } from './detectorKit.js';

/** Global not used — matches are found per line to keep line numbers exact. */
const KEY_LINE_RE = /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{4,}/;
const STRIPE_SIGNAL_RE = /from\s+['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)|STRIPE_[A-Z0-9_]+|new\s+Stripe\b|["']stripe["']\s*:/;

type EnvClass = 'prod' | 'dev' | 'plain' | 'none';

function classifyEnv(path: string): EnvClass {
  const b = basename(path);
  if (b === 'vercel.json' || b.startsWith('.env.production')) return 'prod';
  if (b.startsWith('.env.development') || b.startsWith('.env.local') || b.startsWith('.env.test')) return 'dev';
  if (b === '.env') return 'plain';
  return 'none';
}

interface KeyHit {
  file: CollectedFile;
  lineNo: number; // 1-based
  line: string;
  kind: 'live' | 'test';
  envClass: EnvClass;
}

function findKeyHits(fileset: Fileset): KeyHit[] {
  const hits: KeyHit[] = [];
  for (const file of fileset.files) {
    const envClass = classifyEnv(file.path);
    fileLines(file).forEach((line, i) => {
      const m = KEY_LINE_RE.exec(line);
      if (m === null) return;
      hits.push({ file, lineNo: i + 1, line, kind: m[2] === 'live' ? 'live' : 'test', envClass });
    });
  }
  return hits;
}

function hasStripeSignal(fileset: Fileset): boolean {
  return fileset.files.some((f) => STRIPE_SIGNAL_RE.test(f.content));
}

export function detectLg002(fileset: Fileset): Finding[] {
  const hits = findKeyHits(fileset);
  const evidence: Evidence[] = [];

  for (const hit of hits) {
    let note: string | null = null;
    if (hit.kind === 'live') {
      note =
        hit.envClass === 'dev'
          ? 'A live Stripe key (sk_live/pk_live) is mapped into a development env file.'
          : hit.envClass === 'plain'
            ? 'A live Stripe key is defined in a single unscoped .env serving all environments.'
            : 'A live Stripe key (sk_live/pk_live) is committed to the repository.';
    } else if (hit.kind === 'test' && hit.envClass === 'prod') {
      note = 'A Stripe test key (sk_test/pk_test) is mapped into production configuration.';
    } else if (hit.kind === 'test' && hit.envClass === 'plain') {
      note = 'A Stripe key is defined in a single unscoped .env serving all environments.';
    }
    if (note !== null) {
      evidence.push(
        buildEvidence({
          path: hit.file.path,
          startLine: hit.lineNo,
          endLine: hit.lineNo,
          rawExcerpt: hit.line,
          kind: classifyEnv(hit.file.path) === 'none' ? 'code' : 'config',
          note,
        }),
      );
    }
  }

  if (evidence.length > 0) {
    return [
      makeFinding({
        checkId: 'LG-002',
        seq: 1,
        outcome: 'fail',
        summary: 'A Stripe key is mis-scoped across environments or a live/secret key is committed to the repository.',
        evidence,
      }),
    ];
  }

  if (hasStripeSignal(fileset)) {
    return [
      makeFinding({
        checkId: 'LG-002',
        seq: 1,
        outcome: 'pass',
        summary: 'No committed live keys or cross-environment Stripe key mixing detected.',
        evidence: [],
      }),
    ];
  }

  return [
    makeFinding({
      checkId: 'LG-002',
      seq: 1,
      outcome: 'not_applicable',
      summary: 'No Stripe usage detected; the key-mixing check does not apply.',
      evidence: [],
    }),
  ];
}
