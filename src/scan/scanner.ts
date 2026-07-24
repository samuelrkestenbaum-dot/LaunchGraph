/**
 * Composed deterministic ScannerFn (§9 seam).
 *
 * `createScanner` returns the `ScannerFn` the S1 evaluation harness
 * (`src/eval/harness.ts`) was built to accept: `(fixtureDir) => Report`. It
 * wires the pieces from Commit 1 together —
 *
 *   collect (SEC-6) → LG-001/002/003/004/008/010/014/015 detectors →
 *   decide() (§7) → assemble the §5 Report
 *
 * — and nothing else. Decision logic is not reimplemented; the pure `decide`
 * function owns it. The report is serialized by the S1 canonical serializer in
 * the tests.
 *
 * Determinism (AT-23): the only non-pure input is the wall clock, injected as
 * `now()` (default: real clock). Fixing `now` makes two scans of the same
 * directory produce byte-identical serialized reports.
 *
 * Scope: this slice runs eight deterministic detectors (LG-001/002/003/004/008/
 * 010/014/015), two of which — LG-010 and LG-014 — are warning-ceiling
 * external-bearing checks whose repo-side problems surface as `fail` +
 * severity `warning` (holding the §7 ceiling at `ready_with_warnings`, not
 * driving `not_ready`). The externalVerification-bearing checks (LG-003/010/
 * 014/015, and LG-008's partial branch) hold the §7 Phase-1 ceiling at
 * `ready_with_warnings` for a repo-present-but-unverified app; the remaining
 * checks arrive in later slices, so this is still a subset, not the full
 * Phase-1 product verdict.
 */
import { decide } from '../decision/engine.js';
import { SCHEMA_VERSION } from '../schema/index.js';
import type { Evidence, Fact, Finding, Report } from '../schema/index.js';
import { detectLg001 } from '../checks/lg001.js';
import { detectLg002 } from '../checks/lg002.js';
import { detectLg003 } from '../checks/lg003.js';
import { detectLg004 } from '../checks/lg004.js';
import { detectLg008 } from '../checks/lg008.js';
import { detectLg010 } from '../checks/lg010.js';
import { detectLg014 } from '../checks/lg014.js';
import { detectLg015 } from '../checks/lg015.js';
import { basename } from '../checks/detectorKit.js';
import { collect } from './collect.js';
import type { Fileset } from './collect.js';
import { buildEvidence } from './redact.js';

/** Version stamped into every report (matches package.json). */
export const LAUNCHGRAPH_VERSION = '0.1.0';

export interface ScannerOptions {
  /** Injectable clock for `scannedAt`; defaults to the real clock. */
  now?: () => Date;
  /**
   * §11 `--checks` subset: when present, only findings whose `checkId` is in
   * this list feed the decision. When undefined (every current caller) NO
   * filtering happens and behavior is byte-identical. The filter runs BEFORE
   * `decide`, and never touches the stack-supported short-circuit — an
   * unsupported stack still resolves to `not_evaluated` regardless of `--checks`
   * (AT-24 preserved).
   */
  checks?: readonly string[];
}

const NEXT_DEP_RE = /"next"\s*:/;
const STRIPE_SIGNAL_RE = /from\s+['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)|STRIPE_[A-Z0-9_]+|new\s+Stripe\b|["']stripe["']\s*:/;

interface StackDetection {
  supported: boolean;
  stack: Report['stack'];
  facts: Fact[];
}

/** Locates the first line index (0-based) matching `re` in a file's content. */
function lineOf(content: string, re: RegExp): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i] ?? '')) return i;
  }
  return -1;
}

/**
 * Minimal, honest stack detection: enough to know whether the repo is a
 * supported Next.js/TypeScript stack (so `decide` can apply §2.3 rule 1) and
 * to record the deterministic Facts backing it. Full provider/stack analysis
 * is a later slice.
 */
function detectStack(fileset: Fileset): StackDetection {
  const pkg = fileset.files.find((f) => basename(f.path) === 'package.json');
  const hasNextDep = pkg !== undefined && NEXT_DEP_RE.test(pkg.content);
  const hasAppRouter = fileset.files.some((f) => /(^|\/)app\/.+\/(route|page|layout)\.(?:t|j)sx?$/.test(f.path));
  const hasPages = fileset.files.some((f) => /(^|\/)pages\//.test(f.path));
  const supported = hasNextDep || hasAppRouter || hasPages;

  const stack: Report['stack'] = [];
  const facts: Fact[] = [];

  if (supported) {
    const signals: string[] = [];
    if (hasNextDep) signals.push('dependency:next');
    if (hasAppRouter) signals.push('app-router');
    if (hasPages) signals.push('pages-router');
    stack.push({ provider: 'nextjs', signals, support: 'fully_supported' });
    if (pkg !== undefined && hasNextDep) {
      const idx = lineOf(pkg.content, NEXT_DEP_RE);
      const line = pkg.content.split('\n')[Math.max(0, idx)] ?? '';
      facts.push({
        id: 'fact:stack.nextjs',
        detector: 'dependency-manifest',
        value: true,
        evidence: [
          buildEvidence({
            path: pkg.path,
            startLine: idx + 1,
            endLine: idx + 1,
            rawExcerpt: line,
            kind: 'manifest',
            note: 'Next.js dependency declared in the manifest.',
          }),
        ],
      });
    }
  }

  const stripeFile = fileset.files.find((f) => STRIPE_SIGNAL_RE.test(f.content));
  if (stripeFile !== undefined) {
    stack.push({ provider: 'stripe', signals: ['source-reference'], support: 'fully_supported' });
    const idx = lineOf(stripeFile.content, STRIPE_SIGNAL_RE);
    const line = stripeFile.content.split('\n')[Math.max(0, idx)] ?? '';
    const evidence: Evidence[] = [
      buildEvidence({
        path: stripeFile.path,
        startLine: idx + 1,
        endLine: idx + 1,
        rawExcerpt: line,
        kind: basename(stripeFile.path).startsWith('.env') ? 'config' : 'code',
        note: 'Stripe usage referenced in repository source.',
      }),
    ];
    facts.push({ id: 'fact:stack.stripe', detector: 'source-scan', value: true, evidence });
  }

  return { supported, stack, facts };
}

/**
 * Builds a `ScannerFn`. Wiring, not logic: it never invents findings or
 * decisions — detectors and `decide` do that.
 */
export function createScanner(options: ScannerOptions = {}): (fixtureDir: string) => Report {
  const now = options.now ?? ((): Date => new Date());
  const checks = options.checks;
  return (fixtureDir: string): Report => {
    const fileset = collect(fixtureDir);
    const { supported, stack, facts } = detectStack(fileset);

    const rawFindings: Finding[] = [
      ...detectLg001(fileset),
      ...detectLg002(fileset),
      ...detectLg003(fileset),
      ...detectLg004(fileset),
      ...detectLg008(fileset),
      ...detectLg010(fileset),
      ...detectLg014(fileset),
      ...detectLg015(fileset),
    ];

    // §11 `--checks`: filter to the requested subset before deciding. Undefined
    // means "run everything" — identical to the pre-existing behavior.
    const selectedFindings =
      checks === undefined ? rawFindings : rawFindings.filter((f) => checks.includes(f.checkId));

    const decision = decide({ findings: selectedFindings, stackSupported: supported });

    return {
      schemaVersion: SCHEMA_VERSION,
      launchgraphVersion: LAUNCHGRAPH_VERSION,
      scannedAt: now().toISOString(),
      repo: { root: fileset.root, commit: null, dirty: false },
      stack,
      product: { inferredModel: 'unknown', confidence: 0, evidence: [] },
      facts,
      findings: decision.findings,
      decision: { value: decision.value, reasons: decision.reasons },
      counts: decision.counts,
    };
  };
}

/** Default scanner using the real clock. */
export const scan = createScanner();
