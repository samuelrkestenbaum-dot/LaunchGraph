# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **ACTIVE** — shaped by the build-orchestrator 2026-07-25 under the
  user's explicit go. Awaiting builder start.
- **Id:** **A-S2** (Fork Branch A, Slice 2)
- **Title:** Phase 1 Repository Auditor — LG-005 (non-idempotent webhook
  processing, Layer D+M) + the D→M surfacing repair

---

## 0. The sequencing decision — option (b), and why

Three options were weighed; **(b) LG-005 with the minimum foundation folded in**
was chosen.

**Why not (c) — LG-005 alone.** §3 assigns LG-006 "deterministic event-name
**detection**" (so §4.3 *forces* a deterministic verdict signal) and LG-009
"absence of evidence fails the check", but assigns LG-005 "deterministic
**candidates**; model-assisted **judgment**". LG-005 is the only one whose D layer
is assigned *surfacing*, not verdict — so it can and must attach **no
`establishesVerdict` fact and no Layer-D blocker**. That half holds. It does not
save (c):

1. **The fact was never the mechanical cause of the false `not_ready`.** Tracing
   `runInferenceContract` against engine §7: fail-establishing fact + model `fail`
   → `inferred`/`fail` → rule 3 → `not_ready`. **No fact** + model `fail` →
   `inferred`/`fail` → rule 3 → **`not_ready` all the same**. Removing the fact
   changes nothing in the agreement branch. The false `not_ready` on a correct
   repo is caused by the **withheld disproving file** plus a model that agrees;
   the fact only *biases* the model toward agreeing (it is transmitted in the
   prompt) and corrupts the `pass` branch into a spurious warning. A packet that
   only dropped the fact would ship the defect while appearing to address it.
2. **For LG-005 the surfacing gap is worse and has a third door.** The canonical
   correct idempotency guard is either a dedup helper (`lib/idempotency.ts` —
   surfaced fine) or a unique constraint in a `.sql` migration /
   `prisma/schema.prisma` (**never** surfaced). LG-005's signal (`event.id`,
   upsert/dedup markers) is far commoner than a cancellation event name, so the
   **5-file cap binds routinely** rather than rarely. LG-005 reaches the same
   false `not_ready` via three routes: the extension gate, the cap, and pure model
   agreement on an incomplete surface.

**Why not (a) — a third foundation packet.** Coverage has been 9/15 for two
packets. A third detector-free packet is where "the seam is not perfect yet"
becomes an excuse. And the honest fix is **smaller than the residue's framing
implies**, once two things are noticed:

- **Do not widen `isCodeFile`.** Widening it also widens `isWebhookHandler`,
  changing LG-003/LG-004 inputs — but that fix was never right anyway. Next.js
  App Router resolves `route.ts|tsx|js|jsx` only; `route.mts` is not a route, so
  `isWebhookHandler`'s narrower set is **correct as it stands**. The right move is
  a **second, distinct predicate owned by the surfacing module** —
  `isModelSurfaceableFile` = `isCodeFile` ∪ `{.mts, .cts}` — used *only* by the
  D→M surface and the fact gate. The design call flagged as needing its own
  shaping is thereby **avoided, not deferred**.
- **Invert the fact's gate from a code-denylist to a prose-allowlist.** Today the
  fact fires when no *code* file carries the signal, asserting the mentions are
  "documentation, comments or configuration, which cannot revoke access." That
  clause is **false** for a `.sql` migration or `.prisma` schema — a DB constraint
  absolutely can. Fire the fact only when every non-surfaceable mention is in a
  *positively recognised prose* extension. A pure **narrowing**, so it cannot
  manufacture new blockers, and it changes zero existing assertions (every
  existing fact test uses either no mention or a `README.md`).

**The honest residual — stated, not hidden.** (b) does **not** fully close the
residue TOP ITEM. It closes it for `.mts`/`.cts` (the *sharper* instance per qa)
by surfacing them, and stops the **false fact** for `.sql`/`.prisma`. What
survives: on a repo whose only evidence is a `.sql` migration or `.prisma` schema,
the file is still not surfaced and a model may still say `fail`. That gap cannot
be closed without a **SEC-5 adjudication** about admitting structured non-source
text into a prompt — a real security decision, not something to smuggle into a
detector packet. What this packet does is convert **silent withholding** into
**disclosed withholding**. That is the honest bound and it must go into the
receipt as an open item, not as a closure.

---

## 1. Goal

Ship **LG-005**, taking detector coverage **9 → 10 of 15**, on a D→M surface
repaired first — so the second blocker-capable model-assisted check does not
inherit the false-fact defect still open on the first.

## 2. Done criteria (testable)

- **DC-1 — the extraction exists and is correctly parameterized.**
  `surfaceDelegatedCandidates(fileset, opts)` in a new `src/scan/surface.ts`,
  consumed by **both** `lg006.ts` and `lg005.ts`:
  ```ts
  interface DelegatedSurfaceOptions {
    handlers: readonly CollectedFile[];      // excluded from the delegated set
    selects: (content: string) => boolean;   // FILE-SELECTION predicate — may be conjunctive
    anchor: RegExp;                          // LINE-level window anchor — distinct from `selects`
    cap: number; windowBefore: number; windowAfter: number;
    note: string;
  }
  function surfaceDelegatedCandidates(fileset: Fileset, opts: DelegatedSurfaceOptions):
    { excerpts: Evidence[]; elided: number };
  ```
  **`selects` and `anchor` are two parameters, not one** — see Trap 1.
- **DC-2 — Commit 1 is behaviour-preserving offline.** All **11** per-fixture
  normalized report hashes byte-identical to the A-S1c receipt table.
  `request.supportingFacts` and `request.excerpts` are not serialized into the
  Report, so a correct C1 moves nothing in `report.json`.
- **DC-3 — `.mts`/`.cts` surfaced.** A correct delegating repo whose cancellation
  branch lives in `lib/events.mts` has that file in `request.excerpts`; the
  fail-establishing fact is **absent**; the online scan yields
  `ready_with_warnings`, not `not_ready`. Same for `.cts`.
- **DC-4 — the false fact is not asserted about `.sql`/`.prisma` repos.** A repo
  whose only evidence is `migrations/001.sql` or `prisma/schema.prisma` produces
  **zero** `establishesVerdict` facts, and `request.question` carries the
  non-source-file disclosure naming the count. The prose case (`README.md` only)
  **still** emits the fact — the guard must **discriminate**, not be vacuous.
- **DC-5 — LG-005 exists and attaches no verdict-establishing deterministic claim.**
  `surfaceLg005Candidates` + `interpretLg005` in `src/checks/lg005.ts`, wired into
  `scanWithModel`. No handler → `not_applicable`. Handler + no judgment →
  `unknown` ("model layer disabled"). Handler + judgment → the D→M contract →
  `inferred` fail/pass capped 0.9. **No LG-005 `SupportingFact` carries
  `establishesVerdict`**, asserted directly.
- **DC-6 — SEC-5 blast radius.** Across every `InferenceRequest` built by LG-005
  **and** LG-006, on a repo containing `.sql`, `.prisma`, `.md`, `.mdx` and `.env`
  files: **zero** excerpts whose extension is outside
  `{ts,tsx,js,jsx,mjs,cjs,mts,cts}`.
- **DC-7 — `isCodeFile` untouched.** `src/scan/collect.ts`, `src/scan/webhook.ts`,
  `src/checks/lg003.ts`, `src/checks/lg004.ts` blob SHAs byte-identical to
  `7908d5d` at both commits.
- **DC-8 — emit-only.** `src/decision/engine.ts` (`54b0990…`) and
  `src/schema/index.ts` (`c1ae295…`) byte-identical. Severity/blocker from the
  registry via `makeFinding`, never hardcoded.
- **DC-9 — `--checks` suppresses the model call.** `scanWithModel` makes **zero**
  `infer` calls for a check excluded by `--checks`. Asserted per check id.
- **DC-10 — determinism (AT-23).** Two fixed-clock `--offline` scans
  byte-identical; two fixed-clock online scans with a deterministic
  `FakeModelClient` byte-identical. Model calls **sequential in a fixed check-id
  order** — no `Promise.all`.
- **DC-11 — eval unmoved.** `npm run eval` → **11 fixtures / 11-of-11 / 0 blocker
  false positives**. `fixtures/` tree object
  **`a981446bac76039147d93efedd14a092c2aeadc1`** byte-identical at both ends.
- **DC-12 — AT-24 regression. AMENDED 2026-07-25 (see §13) — the original
  hash-freeze was unsatisfiable.** `fixtures/unsupported/` grows by **exactly one**
  LG-005 `not_applicable` finding and nothing else, and **AT-24 is asserted
  directly rather than via a hash**: decision `not_evaluated`, CLI exit 3, the
  Rule 1 reason string, `counts` unchanged, and zero blocker or warning findings.

## 3. In scope

**Commit 1 — repair the surface before the second consumer exists**
(`src/scan/surface.ts` new; `src/checks/lg006.ts`; tests):

1. Extract `surfaceDelegatedCandidates` per DC-1; migrate `lg006.ts` onto it.
2. `isModelSurfaceableFile` in `src/scan/surface.ts` = `isCodeFile` ∪
   `{.mts, .cts}`, consumed only by the D→M surface and the fact gate.
3. Invert the fact gate to a **prose allowlist**: emit
   `fact:lg006.no-code-cancellation-signal` **iff** no surfaceable-source file
   carries the signal **and** every non-surfaceable file carrying it matches a
   positively-recognised prose extension (`.md|.mdx|.markdown|.txt|.rst`).
   Reword the statement so it is true whenever emitted (drop "or configuration").
4. Generalize the `request.question` disclosure to cover **two** elisions:
   cap-elided source files (existing wording, unchanged in substance) **and**
   non-source files carrying the signal that were withheld (new). The new wording
   **must not** argue completeness in either direction.

**Commit 2 — LG-005** (`src/checks/lg005.ts` new; `src/scan/scanner.ts`; tests):

5. `surfaceLg005Candidates` — third consumer of `locateWebhookHandlers`;
   delegated surface via `surfaceDelegatedCandidates`; bounded question and
   response schema; **no `establishesVerdict` fact**.
6. `interpretLg005` per DC-5; `LG005_PRESENTATION` with **no**
   `externalVerification` (§3: External component = No).
7. `scanWithModel` wiring: sequential, fixed order, plus the `--checks`
   model-call suppression (DC-9) — a defect **created by this packet's second
   model call**: with one check it was invisible; with two, an excluded check
   would still ship repository text off-process.

## 4. Explicitly OUT of scope

- **The `ModelCheck` interface.** Two call sites is not enough evidence to fix an
  interface shape when the remaining four consumers differ structurally: LG-007 is
  pure **M** with no settle predicate, LG-012 carries an `externalVerification`
  marker, LG-013 is warning-tier. Extracting it from LG-006 + LG-005 would fit the
  interface to LG-006's `surface → isSettled → interpret` triple and then force
  LG-007 through a settle predicate it does not have. It would also make Commit 2
  restructure `scanner.ts` while adding a detector, so a red qa could not be
  attributed. **Binding: it rides inside A-S3 as that packet's Commit 1, never as
  its own packet.**
- **Widening `isCodeFile`; migrating `lg003.ts:51`'s webhook copy or the three
  private `CODE_EXT_RE` copies.**
- **Surfacing `.sql`/`.prisma` to the model** — needs its own SEC-5 adjudication.
- **`fixtures/broken-lg-005/` — NOT added. Eval stays at 11. This packet does NOT
  close AT-05.** Eval runs the *sync/offline* scanner, and LG-005 correctly has no
  deterministic disjunct, so an offline scan of a non-idempotent repo yields
  `unknown`, not the `fail` AT-05 demands. The alternative — inventing a Layer-D
  blocker for LG-005 — is rejected because it is **falsifiable on correct
  repositories**: a state-reconciliation handler
  (`UPDATE subscriptions SET status=… WHERE stripe_sub_id=$1`) is idempotent by
  construction and carries **no** `event.id`, upsert, or dedup signal anywhere.
  A repo-wide "no dedup signal ⇒ confirmed blocker" gate would be exactly the
  class of false claim this packet exists to stop. Precedent: LG-006 shipped in
  P-005 with AT-06 unclosed by eval; its deterministic half closed at A-S1b.
  **AT-05 goes to residue as an owed item.**
- Per-check degradation of a model-client error to `unknown` (Trap 5) — residue,
  with current propagate-semantics pinned by a test.
- LG-007/009/011/012/013; engine/schema change; `detectStack`/`supported`/LG-015's
  gate; `collect.ts`'s exclusion set; `golden/` (AT-16); `hostile/`
  (AT-18/20/21/22); SEC-5 delimiter-token hardening; spec-header staleness;
  `report.repo.commit`; the Express/Vite/Fly (Gravito) recipe.
- **No real model API call** — `FakeModelClient` drives every test. No merge, no
  PR, no deploy, no secrets, no push without the standing post-green sequence.

## 5. Verified branch base

```
HEAD                                = 68d4f02  (clean tree, 0 0 vs origin)
git merge-base HEAD origin/main     → fatal: Not a valid object name origin/main
git merge-base HEAD origin/claude/launchgraph-product-scope-43pgdx → a00d194
origin/HEAD                         → not a symbolic ref (unset)
```

**Base for A-S2 = `68d4f02`** (A-S1c close commit; code tip `7908d5d`). Builder
re-verifies the base has not moved before Commit 1.

**FLAG, third packet running: this repo has no default branch.** No `main`, no
`master`, local or remote; `origin/HEAD` unset. "Never merge without go" has **no
target** and a PR has **nowhere to land**. Not this packet's work — needs a user
decision.

**Baseline at `68d4f02`:** 253 tests / 25 files, typecheck clean, eval 11
fixtures / 11-of-11 / 0 blocker FPs.

## 6. ≤2-commit decomposition, and why this split is the satisfiable one

- **Commit 1 = extraction + surface repair, LG-006 only.** Self-contained and
  independently provable: DC-2 (all 11 hashes frozen) proves the offline path did
  not move; the `FakeModelClient` tests prove the online repair. **Green in
  isolation** — nothing in C1 depends on LG-005.
- **Commit 2 = LG-005, purely additive.** One new detector file plus a bounded
  `scanner.ts` change. Its regression surface is exactly those two files.

**Why not the alternatives.** *Extraction in C1, repair+LG-005 in C2* — C2 would
repair LG-006 and introduce LG-005 simultaneously, so a red qa could not be
attributed. *LG-005 first, repair second* — C1 would be **green in isolation while
shipping the known defect**, i.e. the isolation gate would certify a defect. The
chosen split is the only one where the isolation-green commit is also the
*correct* commit.

## 7. Assertion-change budget — exactly these, nothing else

**A budget breach is a STOP, not a judgment call.**

**Commit 1 — at most 2 pre-existing assertion changes, both in
`tests/checks/lg006.test.ts`:**

1. `:378` `expect(facts[0]?.statement).toMatch(/non-code/i)` — only if the
   reworded true statement drops that phrase.
2. `:408` `expect(candidates.request.question).toContain('2 further code file(s)')`
   — only if the generalized disclosure rewords the count clause.

**Commit 1 — ZERO permitted in** `tests/scan/webhook.test.ts`,
`tests/scan/scanModel.test.ts`, `tests/model/*`, `tests/scan/scanner.test.ts`,
`tests/engine.test.ts`, `tests/cli/*`. `tests/scan/webhook.test.ts` is the
zero-assertion-change behaviour-preservation proof for the extraction.

**Commit 2 — exactly 3 pre-existing assertion changes, all in
`tests/scan/scanModel.test.ts`, all with a mandated shape:**

3. `:364` `expect(model.requests).toHaveLength(0)`
4. `:384` `expect(model.requests).toHaveLength(1)`
5. `:392` `expect(model.requests).toHaveLength(1)`

Each becomes `model.requests.filter(r => r.checkId === 'LG-006')` with the **same
numeric expectation**. These guards mean "was LG-006 asked?" — a second model
check makes the *total* the wrong denominator. **Relaxing any of these to
`toBeGreaterThan` is a budget breach**, not a fix.

**Commit 2 — authorized test-INPUT re-bases (not assertion changes, per the A-S1c
precedent), bounded:** every `FakeModelClient` construction in
`tests/scan/scanModel.test.ts` gains an `'LG-005'` script entry, preferably via
one shared helper. See Trap 4 — mandatory, not optional.

**Commit 2 — ZERO permitted in** `tests/scan/scanner.test.ts` (`:98/:153/:168`
`counts.blockers === 0` is the offline-path regression proof — an LG-005 `unknown`
is not a blocker), `tests/cli/*`, `tests/engine.test.ts`, `tests/model/*`,
`tests/checks/lg00{1,2,3,4,8}.test.ts`, `tests/checks/lg01{0,4,5}.test.ts`.

## 8. Binding carry-forward constraints

- **MODEL-LAYER SAFETY BOUNDARY** — credential boundary at `bin/sugarbee.ts` only;
  `RealModelClient` bin-only, built-in `fetch`, no SDK; **no `process.env` /
  network / credential read in model or detector code**; `FakeModelClient` drives
  every test; SEC-5 delimited untrusted data; cite-or-discard; at best `inferred`,
  capped 0.9, never `confirmed`.
- **EMIT-ONLY — engine + schema byte-identical** (DC-8).
- **REGISTRY IS THE SINGLE SOURCE** — severity/blocker/provider via `makeFinding`.
- **externalVerification obligation** — LG-005 is non-external (§3): it carries
  **none** on any branch. LG-012 is the last pending external check (A-S7).
- **TEST-DATA POLICY** — <20 contiguous alphanumerics on every key-shaped fake, no
  Sentry-DSN shape, on every surface including this packet and the receipt.
- **CEILING INVARIANT — structural.** `supported ⇒ hasAppSignal` **by
  construction**; LG-015 can never be `not_applicable` on a supported stack, so
  Rule 6 always pre-empts Rule 7. Must not broaden `supported` or narrow LG-015's
  gate. LG-005's `unknown` on a blocker-capable check feeds Rule 6, which
  **reinforces** the ceiling.
- **`node_modules` EXCLUSION IS LOAD-BEARING TWICE OVER** — it protects LG-006's
  blocker (Stripe's typings name the event) **and** the prompt surface.
  `IGNORED_DIRS` must be re-verified byte-identical. **LG-005 raises the stakes:**
  `event.id` appears throughout `stripe`'s typings, so a vendored-dependency scan
  mode would flood LG-005's delegated surface as well.
- **AT-23 determinism** — fixed-clock byte-identity, both paths; sequential model
  calls only.
- **Per-fixture NORMALIZED report hashes, never a scan-path-dependent aggregate.**
  `repo.root` is embedded in every serialized report. Baseline against the 11-row
  table in `build-os/receipts/A-S1c.md`; the A-S1b `c1f187c5…` aggregate is retired.

## 9. Fixture posture — A-S1c's applies, not A-S1b's

A-S1b authorized one disclosed fixture repair. **A-S1c authorized none, and
A-S1c's posture binds here: ZERO fixture movement authorized.** `fixtures/` tree
object `a981446bac76039147d93efedd14a092c2aeadc1` byte-identical at both ends
(DC-11). If the builder concludes a fixture must change, that is a **STOP and a
re-shaping**, not a judgment call.

Verified achievable rather than asserted: only `broken-lg-004` and `broken-lg-006`
contain a webhook handler; both are already `not_ready` via a `confirmed` blocker
(Rule 2 fires first). Everywhere else LG-005 emits `not_applicable`. The harness
matches only `outcome === 'fail' || 'warning'` (`src/eval/harness.ts:269`) and
counts blocker FPs as `severity==='blocker' && outcome==='fail'` (`:300`), so
LG-005's `unknown`/`not_applicable` findings enter neither set.

**Disclosed rebaseline — Commit 2 only.** Commit 2 adds an LG-005 finding to every
**supported-stack** fixture's report, so **10 of the 11** per-fixture normalized
hashes move. Expected and correct; the A-S1c table is superseded for those rows by
a fresh table in the A-S2 receipt. Two hard constraints: **Commit 1 moves none of
the 11** (DC-2), and **`unsupported/` moves at neither commit** (DC-12, AT-24).

## 10. Pre-mortem — the coupled scope a builder would miss

**Trap 1 — the obvious helper signature silently changes LG-006's behaviour.**
`lg006.ts` uses **two different predicates**: file selection is
`mentionsCancellationBranch` = `deleted || (updated && canceled-status)`
(`:209-213`, conjunctive), while the window anchor is
`SUB_DELETED_RE.test(l) || SUB_UPDATED_RE.test(l)` (`:307`, disjunctive). A builder
implementing the literal `{ handlers, signalRe, cap, window }` signature will
collapse these and silently widen file selection to `deleted || updated` — a
**behaviour change hidden inside a "pure refactor" commit**, invisible to eval (no
fixture exercises it) and to DC-2 (facts and excerpts are not serialized). Highest-
value trap in the packet. A unit test must pin a file containing
`customer.subscription.updated` **without** a canceled status as **not selected**.

**Trap 2 — the untransmitted elision `note` is dead weight the refactor must
preserve verbatim.** `lg006.ts:311-315` writes an elision string into the last
surfaced excerpt's `note`, which `buildUntrustedDataEnvelope` does **not**
transmit (that is why A-S1c moved the real disclosure into `request.question`). It
is nonetheless part of the current output. Preserve it byte-for-byte; deleting it
is a behaviour change requiring budget it does not have.

**Trap 3 — do not invent `isLg005SettledDeterministically`.** The symmetry with
LG-006 is seductive and wrong. LG-005 has no settled state except
`not_applicable`. Any predicate of the form "no idempotency signal anywhere ⇒
settled `fail`" reintroduces precisely the defect this packet closes — see §4's
state-reconciliation counterexample.

**Trap 4 — adding LG-005 to `scanWithModel` turns the entire `scanModel` suite red,
and it will look like a regression.** `FakeModelClient.infer` **rejects** on an
unscripted check id (`src/model/fakeClient.ts:35-37`). Every test in
`tests/scan/scanModel.test.ts` scripts `'LG-006'` only. The moment LG-005 is wired
in, each hits `Error: FakeModelClient: no scripted response for check "LG-005"` and
the failure surfaces as an *LG-006* failure. Add the `'LG-005'` script entry to
every construction (one shared helper) **in the same commit** as the wiring.

**Trap 5 — the second model call widens the blast radius of a model failure.** With
one D+M check, a rejected `infer` failed only that check's scan. With two, an
LG-005 client error now destroys the **LG-006** finding and the whole report
(exit 2). Per-check degradation to `unknown` is the right product behaviour but is
**out of scope** — changing error semantics while adding the second consumer would
conflate two failure modes. Pin the current propagate-semantics with one explicit
test so it is deliberate rather than accidental, and residue the degradation.

**Trap 6 — `Promise.all` is forbidden.** Two `await`s invite parallelization.
`Promise.all` gives nondeterministic rejection ordering and puts AT-23 at risk for
a latency saving AT-28 (<5 min full scan) does not require. Sequential, fixed
check-id order.

**Trap 7 — the prose allowlist must discriminate, not be vacuous.** A-S1c's elision
honesty guard was landed as a regression pin on two phrasings and qa had to prove
it actually fires on counterfactual text. Same standard: assert both directions —
`README.md`-only **emits** the fact, `migrations/001.sql`-only **suppresses** it —
and assert the *reason* for suppression is disclosed in `request.question`, not
merely that the fact vanished.

**Trap 8 — `broken-lg-006`'s handler imports at five levels where four is correct**
(`fixtures/broken-lg-006/app/api/stripe/webhook/route.ts:1-2`, A-S1b residue).
Harmless for LG-006, and A-S1b's residue predicted "a future LG-005 consumer could
trip on it." LG-005 does **not** resolve imports, so it should not trip — but if
the builder's LG-005 design starts reaching for import resolution, **that is the
signal to stop**: A-S1b's reviewer already withdrew import-resolution after it was
shown to reproduce the false blocker on path aliases (`@/lib/…`, the default
`create-next-app` tsconfig), barrel re-exports, and two-hop delegation. Do not
revive it.

**Trap 9 — LG-005 is the product's FIRST pure-model blocker.** With no
deterministic disjunct and no `establishesVerdict` fact, `not_ready` can rest on
nothing but a model judgment at ≥0.7. §7 rule 3 explicitly authorizes this, so it
is spec-faithful — but it is a first, and it interacts with the noisy `event.id`
signal and the cap. **The reviewer must adjudicate this explicitly**, and the
packet must carry a direct false-blocker direction check: a `FakeModelClient` test
on a *correct* idempotent repo (dedup helper in `lib/idempotency.ts`, and a second
variant in `lib/idempotency.mts`) asserting the disproving file **is** surfaced.

**Fixtures needing repair or rebaselining: none.** No repair is authorized (§9).
The only rebaselining is the disclosed Commit-2 hash movement on 10 of 11
fixtures, with `unsupported/` frozen.

## 11. Tool Budget (declared)

`Tools: [Read, Grep, Glob, Edit, Write, Bash, builder, qa, reviewer, archivist] — implement A-S2, prove it, review it, close it`

- **builder** — Commits 1 and 2 exactly as decomposed in §6; test-first.
- **qa** — full suite + eval + Commit-1 isolation in a fresh `npm ci` worktree +
  per-fixture normalized-hash tables at both commits + safety grep + exact
  assertion-budget accounting.
- **reviewer** — verdict only; must adjudicate **Trap 9**, the prose-allowlist
  wording, and the `ModelCheck` deferral.
- **archivist** — `build-os/receipts/A-S2.md` + memory; `build-os/` only.

**Not in budget** (needing any is a STOP): widening `isCodeFile`; touching
`engine.ts`/`schema/index.ts`; editing a fixture; exceeding the §7 assertion
budget; extracting `ModelCheck`; any real model call; any external-mutation tool.

**Second-eyes: still unavailable.** `codex` is not on PATH and no Codex plugin is
present — third packet running. Review will again be single-model analysis plus
empirical probes; **that must be recorded in the receipt** so the proof standard is
not overstated. If genuine second-eyes is wanted, that is a tooling decision to
raise now, not at close.

**Hard stops standing:** no push, merge, PR, deploy, or secrets. Feature-branch
push is available only under the prior standing authorization, and only after qa
green + reviewer PASS + the safety grep. **Merge/PR still have no target.**

## 12. What makes the *next* packet unable to call itself foundation

The "last foundation packet" promise is not owed here, because this packet ships a
detector. The honest version, so the argument cannot be recycled:

**A-S3 must ship LG-009 or LG-011, and the `ModelCheck` extraction rides inside it
as Commit 1.** The seam will then have three consumers — including LG-007's pure-M
shape as the next constraint — which is the first point at which the interface can
be fitted to evidence rather than to LG-006.

Knowably still owed after A-S2, none of which justifies a detector-free packet:
`ModelCheck` (→ A-S3 C1), per-check model-error degradation, the three private
`CODE_EXT_RE` copies + `lg003.ts:51`, the `.sql`/`.prisma` prompt-surface SEC-5
adjudication, **AT-05 closure**, AT-06's model-assisted half, AT-16 `golden/`,
AT-18/20/21/22 `hostile/`, and §9.3's 15/15-recall and 18/18-decision thresholds.

---

## 13. AMENDMENTS — adjudicated mid-packet 2026-07-25

The builder implemented Commit 2, hit two budget breaches, and **stopped per the
contract instead of widening scope**. Both were real defects in this packet as
shaped. Adjudicated and authorized by the main session; recorded here so the
reviewer and archivist read the same rules the builder built to.

### Amendment 1 — assertion budget for Commit 2: 3 → **5**

Two further pre-existing assertions in `tests/scan/scanModel.test.ts` are
authorized, both whole-report byte-identity claims that a **second** D+M check
makes structurally impossible:

- **`:333`** — `layerD` exclusion `f.checkId !== 'LG-006'` widens to
  `['LG-006','LG-005']`. Same shape as the three mandated changes: the test's
  claim is "layer-D findings are identical online vs offline", and LG-005 is D+M,
  so excluding it **restores the assertion's original meaning** rather than
  weakening it.
- **`:377`** — `expect(serializeReport(online)).toBe(serializeReport(offline))` is
  authorized for removal, **but NOT as a bare deletion.** The claim held only
  because LG-006 was the sole model-assisted check *and* was deterministically
  settled; a second D+M check that is never settled makes it false, and `counts`
  is computed inside `decide()` so it cannot be filtered from outside. The real
  claim is already carried by `expect(lg006(online)).toEqual(lg006(offline))`, and
  byte-identity determinism remains covered by DC-10's fixed-clock pairs.
  **Required replacement:** an assertion pinning *why* it no longer holds — that
  the online/offline difference is confined to LG-005, specifically offline
  `unknown`/`confirmed` vs online `inferred` at ≤0.9. This converts a lost
  assertion into a documented behavioural boundary and fails if any *other* check
  ever differs across the two paths, which is the property the original line was
  really protecting.

**Total Commit 2 budget: 5.** A sixth is still a STOP.

### Amendment 2 — DC-12 was unsatisfiable as written

DC-12 contradicted **§9's own sentence** "Everywhere else LG-005 emits
`not_applicable`": any `not_applicable` finding lands in `report.findings` and
moves the serialized hash. **All 11 hashes move, not 10.** `unsupported/` goes
`5d9bad5e2a2d28f1`/4204 → `95b952ffae825bc9`/4569 purely by gaining one
`not_applicable` finding, exactly as LG-006 already contributes.

The builder was right to refuse the repair: giving LG-005 an unsupported-stack
special case no other detector has would trade a cosmetic hash movement for a real
inconsistency in detector behaviour. **AT-24's substance is fully intact** —
decision `not_evaluated`, exit 3, Rule 1 reason, counts unchanged. DC-12 is
restated as a direct behavioural assertion, which is a **stronger** check than a
digest that moves for benign reasons.

### Amendment 3 — the A-S1c receipt's hash column is not reproducible

The builder's per-fixture **byte lengths match the A-S1c receipt exactly on all 11
rows**, independently confirming nothing moved between A-S1c close and A-S2 start
— but the **digests reproduce under no normalization variant tried** (`<ROOT>`,
`<REPO_ROOT>`, `ROOT`, empty, raw, trailing-newline, dir-string; only `<ROOT>`
yields the matching lengths). The receipt therefore records lengths from one
convention and digests from another, and DC-12's original literal
`9f6e2380a768126f` was not checkable as written.

Receipts are append-only, so A-S1c is **not** edited. The correction is recorded
in the A-S2 receipt. **Standing rule from here: publish the normalization
convention alongside any hash table** — the baseline in use is sha256 of
`serializeReport` with `report.repo.root` → `<ROOT>`, first 16 hex — so the next
packet can actually check it.

---
_Shaped by the build-orchestrator on 2026-07-25 under the user's explicit go.
Option (b): LG-005 with the minimum foundation folded in. Amended mid-packet
2026-07-25 (§13) after the builder correctly stopped on two budget breaches. Merge
and PR remain hard stops with no target branch; no deploy, no secrets, no provider
access._
