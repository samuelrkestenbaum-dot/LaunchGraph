# SugarBee.ai Phase 1 Specification: Repository Auditor

- **Status:** Specification — approved scope; implementation underway, one gated packet at a time.
  Evidence allocation: [phase boundaries](evidence-allocation-and-phase-boundaries.md).
- **Parent documents:** [`PRODUCT_SCOPE.md`](../PRODUCT_SCOPE.md) Part I
  §35 (Phase 1) and Part II (the narrowed audit-first wedge).
- **Mode:** Strictly read-only. No provider changes, no production
  credentials, no Chrome control, no purchases, no workflow execution, no
  monitoring.

Phase 1 exists to prove exactly one claim exceptionally well:

> SugarBee.ai can inspect an AI-built SaaS repository and accurately identify
> the consequential conditions preventing a safe production launch.

Everything in this specification serves that claim. Anything that does not is
deferred (§13).

---

## 1. Exact MVP boundaries

### 1.1 What Phase 1 is

A local CLI, `sugarbee`, that:

1. Scans a local TypeScript/Next.js repository on disk.
2. Detects which golden-path providers the repository uses.
3. Classifies every conclusion as a fact, an inference, or an unknown.
4. Evaluates the 15 launch-readiness checks (§3).
5. Attaches repository evidence (file, line range, redacted excerpt) to every
   finding.
6. Produces a readiness decision: `Ready`, `Ready with warnings`, or
   `Not ready` (§7).
7. Generates bounded remediation packages consumable by Claude Code and
   Codex (§8).
8. Emits a human-readable report and a machine-readable JSON report (§11).

### 1.2 What Phase 1 is not

Phase 1 performs **repository evidence only**. It holds no provider
credentials and calls no provider APIs — not even read-only. Checks with an
inherently external component (does the production webhook exist at Stripe?
is the email domain's DKIM record published?) report the repository-side
conclusion and explicitly mark the external side `unverified — requires
provider access (Phase 3)`. Phase 1 never guesses external state.

Hard exclusions (restated from the packet mandate; full list in §13):

- No Chrome or browser control
- No provider mutations of any kind
- No purchases or paid signups
- No production credentials accepted, stored, or requested
- No workflow execution engine
- No post-launch monitoring
- No universal provider support — golden path only, honest support labels
  for everything else (§6.3)

### 1.3 Boundary rules

- **Read-only is structural, not behavioral.** The tool must be *unable* to
  mutate external state, not merely instructed not to: no provider SDK
  clients are instantiated, no credentials are read from the environment,
  and the only permitted network egress is the configured model API (§10).
- **The scanned repository is untrusted input** and is never executed (§10).
- **Output is confined** to the `.sugarbee/` directory inside the scanned
  repository (or an explicit `--out` directory).

## 2. Supported repository and stack

### 2.1 Fully supported (the golden path)

| Dimension | Supported |
|---|---|
| Language | TypeScript (primary); JavaScript best-effort |
| Framework | Next.js 13+ App Router (primary); Pages Router best-effort |
| Package managers | npm, pnpm, yarn, bun (lockfile-based detection) |
| Repo shape | Single-app repository; workspace monorepo with exactly one Next.js app (auto-selected) or one chosen via `--app <path>` |
| Hosting signals | Vercel (`vercel.json`, env conventions) |
| Database/auth | Supabase (SDK, migrations, RLS policies) |
| Payments | Stripe (SDK, webhook routes, price/checkout usage) |
| Email | Resend (SDK, from-addresses, templates) |
| DNS/domain signals | Cloudflare (config references only — no DNS queries) |
| Analytics | PostHog (SDK, capture calls) |
| Monitoring | Sentry (config files, DSN wiring, environment/release settings) |

### 2.2 Detection method

Provider detection combines, in order of authority: dependency manifests and
lockfiles → imports and instantiation sites → provider config files →
environment-variable naming conventions. Each detected stack element records
which signals matched and receives a support classification (§6.3).

### 2.3 Out-of-path stacks

Detected non-golden alternatives (NextAuth instead of Supabase Auth,
Postmark instead of Resend, Google Analytics instead of PostHog, etc.) are
reported honestly with `guided` or `unsupported` labels. Checks that depend
on an unsupported provider return `unknown` or `not_applicable` — never a
guessed result. A repository that is not Next.js/TypeScript at all exits
with a stack report and the decision `not_evaluated (unsupported stack)`
rather than junk findings.

## 3. The initial 15 readiness checks

Check IDs are stable and versioned. Severity is the ceiling a failing
finding may carry; §7 defines how severity and confidence combine into the
decision. "Layer" is D (deterministic), M (model-assisted), or D+M (§4).

| ID | Check | Severity | Layer | External component |
|---|---|---|---|---|
| LG-001 | Production callbacks using localhost | Blocker | D | No |
| LG-002 | Stripe test/live key mixing | Blocker | D | No |
| LG-003 | Missing production webhook | Blocker | D | Yes |
| LG-004 | Missing webhook signature verification | Blocker | D | No |
| LG-005 | Non-idempotent webhook processing | Blocker | D+M | No |
| LG-006 | Missing cancellation handling | Blocker | D+M | No |
| LG-007 | Payment not connected to entitlement | Blocker | M | No |
| LG-008 | Preview deployment using production database | Blocker | D | Partial |
| LG-009 | Missing tenant-isolation evidence | Blocker | D+M | No |
| LG-010 | Unauthenticated email domain | Warning | D | Yes |
| LG-011 | Production email links using the wrong hostname | Blocker | D+M | No |
| LG-012 | Password recovery unverified | Blocker | D+M | Yes |
| LG-013 | Missing signup or purchase conversion event | Warning | D+M | No |
| LG-014 | Sentry installed but unverified in production | Warning | D | Yes |
| LG-015 | Missing or unverified production domain | Blocker | D | Yes |

Per-check outcomes are `pass`, `fail`, `warning`, `unknown`, or
`not_applicable`.

### Check definitions

**LG-001 — Production callbacks using localhost.**
Repository signals: `localhost`, `127.0.0.1`, or `http://` targets in
production-designated configuration — auth redirect URLs, OAuth callback
values, `NEXTAUTH_URL`/site-URL variables, Stripe success/cancel URLs, email
link bases — in `.env.production`, `vercel.json`, or hardcoded in source on
production paths. Fails when a production-designated value resolves to a
development origin; `unknown` when no production URL mapping can be located.

**LG-002 — Stripe test/live key mixing.**
Signals: `sk_live`/`pk_live` values committed anywhere (also reported as a
secret leak and redacted, §10), live keys mapped to development env files,
`sk_test`/`pk_test` mapped to production configuration, or a single
unscoped key variable serving all environments. Deterministic; failures are
`confirmed`.

**LG-003 — Missing production webhook.**
Repository side: given detected recurring-price usage, a Stripe webhook
route must exist (`app/api/**/webhook*/route.ts` or `pages/api/**`) and
subscribe to the lifecycle events the business logic requires. Fails when no
handler exists at all. Whether an endpoint is actually registered at Stripe
is external → that half is always `unverified (Phase 3)`.

**LG-004 — Missing webhook signature verification.**
The webhook handler consumes the request body without
`stripe.webhooks.constructEvent` (or equivalent signature validation on the
`stripe-signature` header). Deterministic AST/pattern analysis of the
handler file.

**LG-005 — Non-idempotent webhook processing.**
No evidence of event-ID deduplication: no persistence or lookup of
`event.id`, no unique constraint/upsert on processed events in the handler
path. Deterministic candidates; model-assisted judgment of whether the
handling is effectively idempotent, with cited evidence.

**LG-006 — Missing cancellation handling.**
No handler branch for `customer.subscription.deleted` (or
`customer.subscription.updated` with a canceled status), or a branch that
never reaches an entitlement downgrade. Deterministic event-name detection;
model-assisted path confirmation.

**LG-007 — Payment not connected to entitlement.**
Checkout-session creation exists, but no traceable path from a success event
(`checkout.session.completed`, `invoice.paid`) to a database mutation that
grants access (plan/entitlement column, organization status). Model-assisted
data-flow trace over deterministically located anchors; classification is at
best `inferred`.

**LG-008 — Preview deployment using production database.**
The same `SUPABASE_URL`/`DATABASE_URL` value or variable serves preview and
production scopes (env files, `vercel.json` env blocks), or a single
unscoped variable exists with no environment separation. Where the mapping
lives only in the provider dashboard, the check returns `unknown` with the
external-verification marker.

**LG-009 — Missing tenant-isolation evidence.**
Organization/tenant tables exist in schema or migrations, but migrations
contain no `ENABLE ROW LEVEL SECURITY`/`CREATE POLICY` for them, or
server-side queries on tenant-owned tables show no tenant scoping. Absence
of evidence fails the check — the burden of proof is on the repository.

**LG-010 — Unauthenticated email domain.**
Repository side: sending addresses extracted from Resend calls and
templates. Fails repo-side when the from-domain is a provider default
(e.g. `onboarding@resend.dev`) or mismatched with the production domain.
DKIM/SPF publication is external → `unverified (Phase 3)`.

**LG-011 — Production email links using the wrong hostname.**
Email templates or link construction resolve, under production
configuration, to localhost, a `*.vercel.app` preview host, or a hardcoded
non-production origin. Deterministic origin extraction; model-assisted
resolution when links are built dynamically.

**LG-012 — Password recovery unverified.**
Fails as a **blocker** when no recovery flow exists at all (no
`resetPasswordForEmail` usage, no reset route/page). When a flow exists, its
end-to-end behavior cannot be proven without email delivery → `unknown`
with a **warning**-level finding and the external-verification marker.
Recovery redirect URLs also feed LG-001.

**LG-013 — Missing signup or purchase conversion event.**
Analytics is initialized (PostHog), but no capture call is reachable from
the signup flow and/or the checkout/purchase flow — page views alone do not
pass. Deterministic capture-site inventory; model-assisted association of
capture sites with the two conversion moments.

**LG-014 — Sentry installed but unverified in production.**
SDK present but DSN absent from production configuration, or no
environment/release tagging configured. Actual event arrival is external →
`unverified (Phase 3)`.

**LG-015 — Missing or unverified production domain.**
No canonical production URL is configured anywhere (site-URL variables,
metadata base, `vercel.json`, sitemap/robots), or configured values
disagree with each other. DNS resolution and TLS are external →
`unverified (Phase 3)`. No DNS queries are performed in Phase 1.

## 4. Deterministic detection versus model-assisted interpretation

Two layers with a strict contract between them.

### 4.1 Deterministic layer (runs first, always)

Parsers and pattern analysis only — manifests, lockfiles, imports, env
files, framework/deploy config, SQL migrations, route enumeration, and
targeted AST queries over TypeScript sources. Output is a set of **Facts**
with `confirmed` classification and confidence 1.0. The deterministic layer
never calls a model and works fully offline.

### 4.2 Model-assisted layer (bounded, optional)

Used only where §3 marks a check M or D+M, and skipped entirely under
`--offline` (affected checks then report `unknown` with the reason
`model layer disabled`). The layer asks bounded, per-check questions
("does this handler reach an entitlement mutation?") with structured-output
schemas. Rules:

1. The model receives only excerpts the deterministic layer surfaced — it
   cannot request arbitrary files and has no tools.
2. Every model claim must cite evidence refs from the provided excerpts;
   uncited claims are discarded.
3. Model output is classified at best `inferred`, with the model's stated
   confidence recorded; it can never upgrade itself to `confirmed`.
4. When model output contradicts a deterministic fact, the fact wins and the
   finding is classified `contradictory` for human review.
5. Repository content in prompts is delimited as untrusted data (§10.4).

### 4.3 Layer assignment is fixed

Each check's spec names which signals come from which layer. A check may not
silently substitute model judgment where the spec requires a deterministic
signal.

## 5. Finding and evidence schemas

Canonical schemas, expressed as TypeScript. The JSON report (§11) serializes
exactly these shapes; the schema version is embedded in every report.

```ts
type Classification =
  | 'confirmed'            // deterministic evidence
  | 'inferred'             // model-assisted, evidence-cited
  | 'unverified'           // requires external (provider) verification
  | 'contradictory'        // deterministic and model signals disagree
  | 'requires_confirmation'; // material ambiguity a human must resolve

type Severity = 'blocker' | 'warning' | 'info';
type CheckOutcome = 'pass' | 'fail' | 'warning' | 'unknown' | 'not_applicable';
type SupportLevel = 'fully_supported' | 'guided' | 'experimental' | 'unsupported';

interface Evidence {
  path: string;            // repo-relative
  startLine: number;
  endLine: number;
  excerpt: string;         // ALWAYS secret-redacted (§10.3)
  kind: 'code' | 'config' | 'manifest' | 'schema' | 'absence';
  note?: string;           // why this excerpt matters
}
// kind 'absence' documents a searched-but-missing signal: path is the
// location searched, excerpt is empty, note states what was expected.

interface Fact {
  id: string;              // e.g. "fact:stripe.sdk-detected"
  detector: string;        // which deterministic detector produced it
  value: unknown;
  evidence: Evidence[];
}

interface Inference {
  id: string;
  question: string;        // the bounded question asked
  answer: unknown;
  confidence: number;      // 0..1, from the model, capped at 0.9
  supportingFacts: string[]; // Fact ids provided as context
  evidence: Evidence[];    // citations; uncited answers are discarded
}

interface Finding {
  id: string;              // e.g. "LG-006-001"
  checkId: string;         // "LG-006"
  title: string;
  severity: Severity;
  outcome: CheckOutcome;
  classification: Classification;
  confidence: number;      // 1.0 for confirmed; model-capped otherwise
  summary: string;         // one-sentence statement of the condition
  evidence: Evidence[];    // never empty for fail/warning findings
  externalVerification?: {
    provider: string;      // e.g. "stripe"
    what: string;          // e.g. "production endpoint subscribes to event"
    phase: 'phase-3';
  };
  remediationPackageId?: string;
}

interface Report {
  schemaVersion: string;
  sugarbeeVersion: string;
  scannedAt: string;       // ISO 8601
  repo: { root: string; commit: string | null; dirty: boolean };
  stack: Array<{ provider: string; signals: string[]; support: SupportLevel }>;
  product: { inferredModel: string; confidence: number; evidence: Evidence[] };
  facts: Fact[];
  findings: Finding[];
  decision: {
    value: 'ready' | 'ready_with_warnings' | 'not_ready' | 'not_evaluated';
    reasons: string[];     // every rule that fired, in order
  };
  counts: { blockers: number; warnings: number; unknowns: number };
}
```

Invariants: every `fail`/`warning` finding carries ≥1 evidence entry;
`absence` evidence is acceptable only when the check defines what was
searched; no `excerpt` may contain an unredacted secret.

## 6. Confidence and support classifications

### 6.1 Classification rules

- Deterministic detection → `confirmed`, confidence 1.0.
- Model-assisted with cited evidence → `inferred`, confidence = model
  confidence, hard-capped at 0.9.
- External-dependent conclusions → `unverified`, regardless of layer.
- Deterministic/model disagreement → `contradictory`.
- Blocker-severity `inferred` findings with confidence < 0.7 are downgraded
  to `requires_confirmation` (§7) — SugarBee.ai does not block a launch on a
  low-confidence guess, and does not hide the uncertainty either.

### 6.2 Confidence bands (for the human report)

`confirmed` renders without a qualifier; ≥ 0.8 renders "high confidence";
0.6–0.8 "moderate confidence"; < 0.6 always renders as a question for the
person, never as an assertion.

### 6.3 Support classification

Every stack element and every check result carries a `SupportLevel` (per
Part I §12). Checks executed against `guided`/`experimental` stack elements
say so inline; `unsupported` elements produce a stack note, not findings.
The auditor never treats a plausible heuristic as tested support.

## 7. Readiness-decision rules

The decision is computed by deterministic rules over findings — never by a
model. Rules fire in order; every fired rule is recorded in
`decision.reasons`.

1. Stack unsupported (§2.3) → `not_evaluated`. Stop.
2. Any finding with severity `blocker`, outcome `fail`, and classification
   `confirmed` → `not_ready`.
3. Any finding with severity `blocker`, outcome `fail`, classification
   `inferred`, and confidence ≥ 0.7 → `not_ready`.
4. Blocker-severity `inferred` findings with confidence < 0.7 → reclassified
   `requires_confirmation`, counted as warnings, listed in a dedicated
   "needs your confirmation" report section.
5. `contradictory` findings on blocker-capable checks → treated as rule 4.
6. If no rule 2–3 firing: any warnings, any `unknown` outcomes on
   blocker-capable checks, or any pending external verifications →
   `ready_with_warnings`.
7. Otherwise → `ready`.

**Phase 1 ceiling:** because checks LG-003, LG-010, LG-012, LG-014, and
LG-015 always carry pending external verification, a Phase 1 scan of a
subscription SaaS can reach at best `ready_with_warnings`. The unqualified
`ready` is reserved for the day external verification exists (Phase 3+ and
journey verification in Phase 6). The report states this ceiling explicitly
rather than inflating the decision. There is no override mechanism in
Phase 1.

## 8. Claude Code and Codex remediation-package format

One package per `fail`-outcome finding that is repairable in the repository
(external-only gaps get an "exact external steps" section in the report
instead). Packages are plain markdown with YAML front matter — readable by a
human, parseable by tooling, and containing no agent-specific syntax so the
same package drives Claude Code or Codex unchanged.

Location: `.sugarbee/remediation/<finding-id>-<slug>.md`

```markdown
---
schemaVersion: "1"
findingId: LG-006-001
checkId: LG-006
severity: blocker
authorizedScope:
  - src/app/api/stripe/webhook/**
  - src/lib/entitlements/**
  - tests/**
prohibited:
  - live provider configuration changes
  - creating or modifying webhooks at any provider
  - deployments
  - new dependencies
  - changes outside authorizedScope
---

# Task
Implement subscription cancellation handling.

# Finding
<one-paragraph statement of the condition>

# Evidence
- `src/app/api/stripe/webhook/route.ts:12-48` — handler switch has no
  `customer.subscription.deleted` branch.

# Requirements
- Verify the webhook signature (do not weaken existing verification)
- Handle duplicate deliveries idempotently
- Update the organization's entitlement on cancellation
- Record the cancellation
- Add tests for the new branch, including duplicate delivery

# Tests
<specific test cases the package requires>

# Acceptance criteria
<observable, repository-verifiable criteria>

# Verification
<how the auditor will re-verify on rescan — which check must flip to pass>

# Completion
Open a pull request and return test evidence. Repository completion is
separate from external verification.
```

Bounding rules: one finding per package; `authorizedScope` is a closed glob
list; the `prohibited` list always includes every external mutation; a
package never asks the agent to touch provider state. Rescanning the
repository after a package is applied is the package's verification.

## 9. Fixture repositories and evaluation methodology

### 9.1 Fixture set

Eighteen vendored fixture apps under `fixtures/` (minimal apps, never
installed or executed — §10):

- `golden/` — a correct subscription SaaS on the full golden path. Expected:
  zero blockers, zero warnings other than the Phase 1 external-verification
  ceiling.
- `broken-lg-001/` … `broken-lg-015/` — one fixture per check, each seeding
  exactly that defect in an otherwise-correct app, with realistic distractor
  code so detection is non-trivial.
- `hostile/` — a fixture combining multiple defects with adversarial
  content: prompt-injection text in source and docs, a malicious
  `postinstall` script, a decoy `CLAUDE.md` with instructions, oversized and
  binary files, symlinks pointing outside the repo, and seeded fake secrets.
- `unsupported/` — a minimal non-Next.js repository (a plain Express app)
  proving honest refusal: expected decision `not_evaluated`, exit code 3,
  and zero findings.

Every fixture carries an `expected.json` ground-truth manifest (findings by
check ID, expected outcomes, expected evidence paths).

### 9.2 Evaluation harness

`sugarbee eval` runs the scanner across all fixtures and diffs results
against ground truth, reporting per-check precision and recall, blocker
false positives on `golden/`, decision correctness, and evidence-path
accuracy (a finding only counts as correct if it cites an expected file).

### 9.3 Acceptance thresholds for the Phase 1 packet

- Recall on seeded defects: 15/15 (every seeded condition found, correct
  check ID, correct file cited).
- Blocker false positives on `golden/`: 0.
- Decision correctness: 18/18 fixtures.
- Determinism: two `--offline` runs on the same commit produce
  byte-identical JSON reports (excluding `scannedAt`).
- The `hostile/` fixture passes every security acceptance test (§12).

Fixtures are controlled, so thresholds are exact. Real-world precision is
measured later on agency projects (Part II); the eval harness is the
regression gate that makes that measurement trustworthy.

## 10. Security requirements for scanning untrusted repositories

The scanned repository is untrusted input (Part I §26). Requirements are
numbered for traceability to acceptance tests.

- **SEC-1 — No execution.** The target repository's code is never executed:
  no `npm install`, no postinstall hooks, no builds, no test runs, no script
  evaluation. Static parsing only.
- **SEC-2 — No repo-directed network.** The scanner performs no DNS queries
  and fetches no URLs. URLs found in repository content are data, never
  dereferenced. The sole permitted egress is the configured model API
  endpoint; under `--offline`, zero egress.
- **SEC-3 — No credential intake.** The scanner does not read provider
  credentials from the host environment, accepts none as flags or config,
  and instantiates no provider SDK clients.
- **SEC-4 — Secret redaction.** Values matching secret patterns (provider
  key formats, private keys, high-entropy env values) are masked before they
  reach findings, reports, remediation packages, logs, or the model layer.
  Env-file values are masked categorically. Detected committed secrets
  produce a redacted finding.
- **SEC-5 — Prompt-injection defense.** Repository content sent to the model
  layer is wrapped as untrusted data; the model layer has no tools and its
  output is constrained to the per-check schema. Instruction-like text in
  the repository (including `CLAUDE.md`/`AGENTS.md` in the *scanned* repo)
  must not alter checks, scope, or output. Verified by the `hostile/`
  fixture.
- **SEC-6 — Filesystem containment.** Symlinks are not followed outside the
  repo root; path traversal is rejected; binary files are skipped; per-file
  (2 MB) and per-repo (50k files) limits with a scan timeout. Writes are
  confined to `.sugarbee/` (or `--out`).
- **SEC-7 — Honest degradation.** Any security limit that truncates coverage
  (skipped files, timeouts) is reported in the scan output — silent
  truncation is treated as a defect.

## 11. CLI and report experience

### 11.1 Commands and flags

```
sugarbee scan [path]
  --json            emit JSON report to stdout
  --out <dir>       output directory (default: <repo>/.sugarbee/)
  --offline         deterministic layer only; no network at all
  --checks <ids>    run a subset (e.g. LG-001,LG-004)
  --app <path>      select the app in a monorepo
sugarbee eval    run the fixture evaluation harness (repo development)
```

### 11.2 Terminal experience

Decision banner first, blockers before warnings, every finding with its
evidence path and classification qualifier, external verifications and
"needs your confirmation" items in their own sections. Abbreviated example:

```
SugarBee.ai scan — my-saas @ 4f2a91c

Stack: Next.js · Vercel · Supabase · Stripe · Resend · PostHog · Sentry
Inferred product: B2B subscription SaaS (high confidence)

NOT READY — 3 blockers, 2 warnings, 4 pending external verifications

BLOCKER  LG-006  Cancellation does not remove access
         src/app/api/stripe/webhook/route.ts:12  (high confidence)
BLOCKER  LG-004  Webhook consumed without signature verification
         src/app/api/stripe/webhook/route.ts:9   (confirmed)
...

Remediation packages: .sugarbee/remediation/ (3 packages)
Report: .sugarbee/report.md · .sugarbee/report.json
```

### 11.3 Outputs

`report.md` (human evidence package, mirroring the Part II example format),
`report.json` (§5 `Report` schema), and `remediation/*.md` (§8). Reports
state the Phase 1 decision ceiling (§7) wherever external verification is
pending.

### 11.4 Exit codes

`0` decision `ready` or `ready_with_warnings` · `1` `not_ready` ·
`2` scan error · `3` `not_evaluated` (unsupported stack). CI can therefore
gate on the auditor directly.

## 12. Acceptance tests

The Phase 1 packet is done when all of the following pass:

- **AT-01…AT-15:** for each check LG-001…LG-015, scanning
  `broken-lg-<id>/` yields the seeded finding — correct check ID, `fail`
  outcome, correct severity, and evidence citing the expected file — and no
  other blocker findings.
- **AT-16 (golden):** `golden/` yields zero blockers and decision
  `ready_with_warnings` with only the external-verification ceiling in
  `decision.reasons`.
- **AT-17 (decision rules):** synthetic finding sets exercise every §7 rule,
  including the confidence-downgrade rule 4 and `contradictory` rule 5.
- **AT-18 (no execution / SEC-1):** the `hostile/` fixture's `postinstall`
  and scripts leave no canary artifacts after a scan.
- **AT-19 (no network / SEC-2):** a scan under a deny-all egress sandbox
  succeeds in `--offline` mode and touches only the model endpoint
  otherwise; repo-embedded URLs are never resolved.
- **AT-20 (redaction / SEC-4):** seeded fake secrets in `hostile/` appear in
  no report, package, log, or recorded model request.
- **AT-21 (injection / SEC-5):** `hostile/`'s injection text and decoy
  agent-instruction files alter no check results and inject no content into
  reports or packages.
- **AT-22 (containment / SEC-6):** out-of-root symlinks are not followed;
  oversized/binary files are skipped and reported per SEC-7.
- **AT-23 (determinism):** two `--offline` scans of the same commit produce
  byte-identical `report.json` (excluding `scannedAt`).
- **AT-24 (unsupported stack):** the `unsupported/` fixture exits `3` with
  a stack report and no findings.
- **AT-25 (schemas):** all emitted reports and packages validate against the
  §5 and §8 schemas.
- **AT-26 (evidence invariant):** every `fail`/`warning` finding across all
  fixtures carries non-empty evidence.
- **AT-27 (offline degradation):** `--offline` marks all M-layer checks
  `unknown` with the documented reason, and never fabricates their results.
- **AT-28 (performance):** an `--offline` fixture scan completes in under
  60 seconds; a full scan (model layer included) in under 5 minutes.
- **AT-29 (no credential intake / SEC-3):** a scan run with decoy provider
  credentials seeded in the host environment (`STRIPE_SECRET_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`) produces output identical
  to a credential-free run, and the decoy values appear in no report,
  package, log, or recorded model request.

## 13. Explicitly deferred functionality

Deferred, with the phase that owns it (per `PRODUCT_SCOPE.md` §35):

| Deferred | Owner |
|---|---|
| Claude Code plugin / Codex skill packaging, local MCP server | Phase 2 |
| Read-only provider API inspection (Stripe/Vercel/Supabase/Resend/PostHog/Sentry state) | Phase 3 |
| External-side resolution of LG-003/010/012/014/015 | Phase 3 |
| DNS, TLS, and domain probes | Phase 3 |
| Chrome collaboration, "take me there" routing | Phase 4 |
| Change previews, approvals, team authority, any provider write, rollback | Phase 5 |
| Canonical customer-journey execution and the unqualified `Ready` | Phase 6 |
| Post-launch monitoring, drift, incidents | Phase 7 |
| Additional recipes, languages, frameworks, providers | Phase 8 |
| Cost estimation and launch-plan generation (listed under §35 Phase 1; requires the provider plan/cost knowledge base, so it follows the auditor core as a subsequent packet) | Later Phase 1 packet |
| Production-status classification (scope §7.3) — its dominant signals (deployment activity, live customers, analytics traffic, webhook deliveries) are external provider state | Phase 3 |
| Business-capability graph as a versioned, general asset (scope §16) — Phase 1 hard-codes the subscription-SaaS slice inside the 15 checks | Later Phase 1 packet |
| Recipe selection (scope §11) — Phase 1 assumes the single subscription-SaaS recipe | Later Phase 1 packet |
| Purchases, production credentials, workflow engine, incident management | Out of Phase 1 entirely |

Deferral notes are recorded here rather than silently dropped so the §35
phase map and this packet stay reconciled.

---

## Appendix: Phase 1 acceptance restated

Phase 1 succeeds when a deliberately incomplete reference SaaS produces an
excellent evidence package — the 15 conditions detected with exact evidence,
a defensible `Not ready`, and remediation packages a coding agent can apply —
and when the corrected repository rescans clean to the Phase 1 ceiling. That,
and nothing broader, is the packet.
