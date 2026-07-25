# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **ACTIVE**
- **Id:** **A-S1c**
- **Title:** Phase 1 Repository Auditor — **the D→M surfacing contract**: repo-scoped
  excerpt surfacing + deterministic-layer-first ordering + honest contradiction
  handling — Fork Branch A, Slice 1c
- **Authority:** build. **Explicit go given by the user (2026-07-25).**
- **Route:** builder → qa → reviewer → archivist
- **Previous:** A-S1b (closed 2026-07-25, receipt `build-os/receipts/A-S1b.md`)
- **Next after this:** **A-S2 — LG-005 (non-idempotent webhook, Layer D+M)**, which
  consumes this contract. A-S2 stays a staged candidate; it is NOT in this packet.

---

## §0. Sequencing decision — the D→M contract lands FIRST, as its own packet

**Decision: option (a).** A-S1c (this packet) lands the D→M surfacing contract.
**LG-005 lands on top of it as A-S2.** Options (b) fold-into-A-S2 and (c)
ship-LG-005-on-today's-contract are both rejected. Reasoning, in order of weight:

1. **`inference.ts` is shared machinery for six future checks.** The contract
   change touches `runInferenceContract`, which every D+M check ahead
   (LG-005/007/009/011/013 and LG-012 at A-S7) will inherit. Proving it on the ONE
   existing consumer — with the existing 11-fixture eval corpus as a byte-identical
   regression baseline — is strictly cheaper and strictly more attributable than
   proving it on two consumers at once, one of which does not exist yet. If a
   behavior regression appears while LG-005 is being validated, nothing separates
   "the contract broke it" from "the new detector is wrong."
2. **It is a behavior change to a shipped check, on a path with no fixture coverage.**
   LG-006's online path is exercised only by `FakeModelClient` integration tests. A
   behavior change there deserves its own qa regression, its own reviewer
   adjudication (three genuine design calls, §7 below), and its own receipt.
   A-S1b's own history argues this: it took a fix-then-pass round to catch a false
   blocker. A round like that, spanning a contract change *and* a new detector,
   forces a rewrite of the detector commit on top of a moving contract.
3. **≤2 commits with Commit-1 green in isolation is genuinely satisfiable here and
   is not satisfiable for the fold.** This packet has a natural two-commit split
   where the primitive precedes its consumer (§5). Folding LG-005 in requires a
   third commit: contract-primitive, contract-consumer, detector+fixture. Compressing
   that into two means one commit is the whole contract and the other is the whole
   detector — two packets wearing one hat, with no room for the reviewer round
   history says to expect.
4. **The assertion-change budget — the thing that kept A-S1b and P-005 honest — is
   enumerable for this packet and unbounded for the fold.** §8 pins this packet at
   **exactly one** changed pre-existing assertion. Adding a new detector, a new
   fixture, registry wiring and an eval rebaseline makes that number unstateable in
   advance, which destroys the budget as a control.
5. **LG-005 needs a settled seam, exactly as A-S1b handed it the locator seam.**
   §3 defines LG-005 as "no persistence or lookup of `event.id`, no unique
   constraint/upsert on processed events **in the handler path**." "Handler path" is
   *code reachable from the handler*, not the handler file — a repo whose route
   delegates to `lib/events.ts` where the `event.id` upsert lives is CORRECT and,
   on today's surfacing contract, would emit a blocker `fail` from a model that was
   never shown the file. That is the identical defect, on a blocker-capable check,
   for the second time. Option (c) does not merely defer the defect — it duplicates
   it, and then requires LG-005's tests and fixture to be rebaselined a second time
   when the contract eventually lands. **(c) compounds; it cannot be shown not to.**

**Cost of this decision, stated honestly:** detector coverage stays at **9 of 15**
for a second consecutive packet. A-S1b also added no detector and was right not to.
This packet buys the seam that makes the next four D+M detectors cheap.

### What replaces the lost contradiction guard (the question §0 was required to answer)

The reviewer's identified cost is real: gating the fail-establishing supporting fact
on the same repo-wide predicate that gates the blocker makes
`fact:lg006.no-cancellation-branch` dead code, and LG-006 loses its only
contradiction-guard test, with no branch-present deterministic fact to replace it.

**The replacement is `fact:lg006.no-code-cancellation-signal`**, gated on a
**code-file** predicate rather than a repo-wide any-file predicate. This creates a
live, honest, branch-present case the model is genuinely asked about:

| Cancellation signal | Layer | Fact | Model asked? |
|---|---|---|---|
| Nowhere in the repo | **D** — settled | (fact present, never consulted) | **No — zero `infer` calls** |
| Only in **non-code** files (README, `CLAUDE.md`, a SQL comment, a commented-out branch) | **M**, with a deterministic thumb on the scale | **`fact:lg006.no-code-cancellation-signal`, `establishesVerdict: 'fail'`** | **Yes** — a model that sees real handling and says `pass` is **`contradictory`** |
| In at least one **code** file | **M** | none | Yes — plain `inferred` |

This is not a relocation of the defect. It is the residue's own comment-suppression
item (A-S1b residue #4: "a README / agent spec / commented-out branch merely *naming*
the event flips the blocker to `unknown`") turned from a silent recall hole into a
model question with a deterministic fact attached. It is exactly the case where the
deterministic layer has a real, defensible opinion and the model may honestly
disagree — which is what §4.2 rule 4 exists for. The guard is therefore **stronger**
than the one it replaces, because the fact it asserts is *true* in that case, whereas
`fact:lg006.no-cancellation-branch` asserted a handler-file-scoped claim that was
simply wrong on the dominant delegating idiom.

---

## §1. Goal and testable done criteria

**Goal.** Make the deterministic layer's contract with the model layer honest, on
both the offline and the online path, so that: (i) the D layer settles what it can
settle before any model is consulted (§4.1/§4.3); (ii) the D layer surfaces the code
the handler delegates to, not only the handler file; and (iii) a deterministic/model
disagreement produces a finding that some §7 rule actually fires on.

**Done criteria — each is a committed, executable test.**

- **DC-1 (delegating surface).** On a correct **delegating** repo (route verifies the
  signature then `await handleStripeEvent(event)`, the cancellation branch in
  `lib/events.ts`), `surfaceLg006Candidates(...).request.excerpts` **contains an
  excerpt from `lib/events.ts`**, windowed and noted.
- **DC-2 (no false blocker from an incomplete surface).** The same repo scanned
  **online** with a model returning `pass` yields LG-006 `pass` / `inferred`,
  decision `ready_with_warnings`. *(Precise claim: this packet closes "the D layer
  never hands the model a surface that omits the code the handler delegates to." It
  does not and cannot claim "the model can never be wrong" — a scripted `fail`
  judgment on that repo still yields `not_ready`, and that is now correct behavior,
  because the model was shown the code.)*
- **DC-3 (§4.3 layer assignment is fixed).** On a repo where **no file** carries a
  cancellation signal, the **online** path yields LG-006 `fail` / `confirmed` /
  confidence `1` / blocker → `not_ready`, **identical to the offline finding**, and
  `FakeModelClient.requests.length === 0` — the model is not asked, whatever it would
  have said.
- **DC-4 (contradiction fires a rule).** On a repo whose ONLY cancellation mention is
  in a non-code file, with a model returning `pass`: the emitted finding is
  `contradictory` with **outcome `fail`**; after `decide()` it is
  `requires_confirmation`, counted as a **warning**, `decision.reasons` names
  **Rule 5**, and the decision is `ready_with_warnings`. It is **never** rendered as
  "LG-006: pass."
- **DC-5 (contradiction can never manufacture a blocker).** A `contradictory`
  blocker-capable `fail` can never produce `not_ready` — Rule 2 requires `confirmed`,
  Rule 3 requires `inferred`, and Rule 5 reclassifies to `requires_confirmation`.
  Asserted as an explicit engine-level test, not merely argued.
- **DC-6 (SEC-5 blast radius).** **No non-code file may ever enter
  `request.excerpts`.** Asserted on a repo containing a `README.md` that names
  `customer.subscription.deleted`.
- **DC-7 (determinism, AT-23).** Surfaced non-handler files are path-sorted, capped,
  and windowed from the first matching line; two fixed-clock runs are byte-identical.
- **DC-8 (offline path untouched).** All **11** fixture serialized reports are
  **byte-identical** to a baseline computed at `e8f6f99` *before any edit*;
  `npm run eval` stays **11 fixtures / 11-of-11 decisions / 0 blocker false
  positives**; `src/decision/engine.ts` and `src/schema/index.ts` blob SHAs unchanged.

---

## §2. Scope

### In scope

**C1 — Contradiction is an outcome, not just a label** (`src/model/inference.ts`).
In `runInferenceContract`, when `classifyAgainstFacts` yields `contradictory`, the
finding's outcome is **forced to `'fail'`**, bypassing
`presentation.outcomeForVerdict`. Document `outcomeForVerdict` as consulted only for
non-contradictory judgments. Rationale: §7 rule 5 routes contradictory findings on
blocker-capable checks to rule-4 treatment (`requires_confirmation`, counted as
warnings, listed in the dedicated "needs your confirmation" section) — and the engine
implements rule 5 as `outcome === 'fail' && classification === 'contradictory'`.
Today a contradictory *pass* carries outcome `pass`, so **no rule fires at all** and
the human report renders "LG-006: pass". This is the shared fix; LG-005 inherits it.
*(Also resolves the deferred P-003-S1 spec-clarification item "rule-5 behavior for
contradictory non-fail outcomes is unspecified.")*

**C2 — The deterministic layer settles first, in BOTH paths**
(`src/checks/lg006.ts`, `src/scan/scanner.ts`).
- Hoist the `!hasCancellationSignalAnywhere` disjunct **above** the
  `judgment === undefined` branch in `interpretLg006`, so a supplied judgment can
  never override a required deterministic signal.
- Expose whether the check is already settled (a `settledDeterministically` field on
  `Lg006Applicable`, or a small exported predicate), and have `scanWithModel`
  **skip the `model.infer` call entirely** when it is. §4.1: "the deterministic layer
  runs first, always."
- **FORBIDDEN repair:** making the hoist conditional on `judgment === undefined`, or
  otherwise letting a judgment reach the settled case. That *is* the defect.

**C3 — The surfaced excerpt set follows the question's scope, not the handler file**
(`src/checks/lg006.ts`; additive `isCodeFile` export in `src/scan/collect.ts`).
- `request.excerpts` = **(a)** every located handler, whole file, as today; **plus
  (b)** up to **5** additional **code** files elsewhere in the repository that carry a
  cancellation signal, taken in the collector's path-sorted order, each surfaced as a
  **bounded window around the first matching line (−10 / +30 lines, clamped)** with a
  note naming why it was surfaced. When the cap elides files, the elision is disclosed
  in the last surfaced excerpt's `note`.
- **Only code files may ever be surfaced.** The code-extension predicate becomes a
  single exported `isCodeFile`; `src/scan/webhook.ts`'s private `CODE_EXT_RE` is
  migrated onto it (there must not be a second copy — that is the drift the A-S1b
  extraction exists to prevent).
- Update `QUESTION` so it names the handlers **and the surfaced delegated modules**.
- **Retire `fact:lg006.no-cancellation-branch`.** Replace with
  **`fact:lg006.no-code-cancellation-signal`** (`establishesVerdict: 'fail'`), emitted
  when **no code file in the repository** carries a cancellation signal; its statement
  must say that any mentions found were in non-code files.
- `hasCancellationBranch` (handler-file-scoped) **survives but gates only the focused
  branch excerpt.** It must gate no fact and no outcome.
- **No non-establishing "context" facts are added** — deliberately, to keep §8's
  budget stateable and to keep the existing `supportingFacts).toHaveLength(0)`
  assertion meaningful.

### Explicitly out of scope

- **LG-005 — OUT. That is A-S2.** No LG-005 detector, registry wiring, presentation,
  fixture, or test. Likewise every other pending detector (LG-007/009/011/012/013).
- **No new fixture. `eval` stays at 11 fixtures.** The online path is not exercised by
  eval, so a fixture would prove nothing here; the `FakeModelClient` integration tests
  are the right artifact. A `delegating-ok/` offline fixture is a residue candidate.
- **No engine change, no schema change.** Emit-only. Blob SHAs must be unchanged.
- No report-surface change. `src/cli/reportMd.ts` already groups
  `requires_confirmation` and already renders `contradictory` — verify, do not modify.
- No import resolution / reachability analysis. A-S1b's reviewer withdrew that
  approach after the builder demonstrated it reproduces the false blocker on path
  aliases (`@/lib/events`), barrel re-exports, and two-hop delegation. Do not revive it.
- `lg003.ts:51`'s third copy of the **webhook** predicate — still deferred, still
  non-blocking. (Distinct from the *code-extension* predicate, which this packet does
  unify.)
- `detectStack` / `scanner.supported` / LG-015's applicability gate — untouched.
- `collect.ts`'s exclusion set — **untouched**; the additive `isCodeFile` export is the
  only permitted change to that file.
- SEC-5 delimiter-token hardening; `golden/` (AT-16); `hostile/` (AT-18/20/21/22);
  spec-header staleness; `report.repo.commit`; the Express/Vite/Fly (Gravito) recipe.
- **No real model call.** `FakeModelClient` drives every test. No push, merge, PR,
  deploy, or secret handling inside the builder's work.

---

## §3. Verified branch base

- Repo `/home/user/LaunchGraph`, branch **`claude/sugarbee-project-handoff-ic47uc`**.
- HEAD **`e8f6f99`** (A-S1b receipt commit; code tip `6509b35`). Working tree
  **clean**. `0 0` ahead/behind `origin/claude/sugarbee-project-handoff-ic47uc`.
- `git merge-base HEAD origin/main` → **`fatal: Not a valid object name origin/main`**.
  **This repo has no default branch** — no `main`, no `master`, locally or remote.
  `git merge-base HEAD origin/claude/launchgraph-product-scope-43pgdx` → **`a00d194`**
  (retired branch tip); root commit `c7267e8`.
- **Base assessment: CORRECT for this packet.** A-S1c continues Fork Branch A directly
  on the A-S1b tip, which is where the code it modifies lives. **Flagged, not
  blocking:** "verify the branch base" has no protected base to verify against and
  "never merge without go" has no target — a standing user decision, carried forward
  from A-S1b, explicitly not this packet's work.
- The builder **re-verifies the base at start** and stops if it has moved.

---

## §4. Why the current contract is wrong (the evidence the builder is fixing)

Three distinct defects, one root cause — *what the deterministic layer hands the
model, and what it claims while handing it over*:

1. **`lg006.ts:249-255`** builds `request.excerpts` from located **handler files
   only**. On the dominant Next.js/Stripe idiom the cancellation branch is not in the
   handler file, so the model is asked a question about code it was never shown.
2. **`lg006.ts:239-247`** gates the `fail`-establishing supporting fact on
   `hasCancellationBranch` (**handler-file scope**) while the deterministic blocker is
   gated on `hasCancellationSignalAnywhere` (**repo scope**). On a delegating repo the
   fact is *false*, so a model that correctly answers `pass` is marked
   `contradictory` against a claim that is simply wrong.
3. **`lg006.ts:352`** runs the D→M contract whenever a judgment exists, **without
   first evaluating the deterministic disjunct**. Online, a branch-absent repo is
   therefore decided by the model — the substitution §4.3 forbids — and because
   `outcomeForVerdict('pass') === 'pass'` while `engine.ts:114` filters rule 5 on
   `outcome === 'fail'`, a model `pass` fires **no rule at all** and the report
   renders "LG-006: pass" on a repo where nothing can revoke access.

All three are pre-existing (identical at `ed71d6e`) and dormant unless a real model is
configured at the bin. All three are on LG-005's path.

---

## §5. Commit decomposition (≤2), and why this split is the satisfiable one

### Commit 1 — "Contradiction is an outcome (D→M contract)"

- `src/model/inference.ts` — C1 only.
- `tests/model/inference.test.ts` — assert the contradictory outcome; assert
  `outcomeForVerdict` is not consulted for a contradictory judgment.
- `tests/engine.test.ts` — **new** DC-5 test: a contradictory blocker-capable `fail`
  can never yield `not_ready`.
- `tests/scan/scanModel.test.ts` — the single pre-existing assertion change (§8).

**Green in isolation: yes.** Self-contained; depends on nothing in Commit 2. It
already closes the "renders LG-006: pass" hole for every contradictory judgment
reachable today, and it is independently valuable if Commit 2 were never written.

### Commit 2 — "Surface the delegated path; the D layer settles first"

- `src/scan/collect.ts` — **additive** `isCodeFile` export, nothing else.
- `src/scan/webhook.ts` — consume `isCodeFile`; delete the private `CODE_EXT_RE`.
- `src/checks/lg006.ts` — C2 + C3.
- `src/scan/scanner.ts` — `scanWithModel` skips `model.infer` when settled.
- `tests/checks/lg006.test.ts`, `tests/scan/scanModel.test.ts` — the six test-input
  re-bases (§8) plus the new tests T1–T7 (§9).

### Why this order, and why not the other one

- **The primitive must precede its consumer, for safety, not tidiness.** Commit 2's
  replacement guard (`no-code-cancellation-signal` → `contradictory`) is only
  *observable* through Commit 1's outcome rule. Landing Commit 2 first would ship an
  intermediate state where the new guard exists and is **silently dropped** — green,
  but wrong, and wrong in exactly the way this packet exists to fix. This is the same
  argument the A-S1b reviewer upheld for putting `.filter()` in Commit 1: a safety
  requirement of part 2, not a preference of part 1.
- **Commit 2 cannot be split further without an incoherent intermediate.** The hoist
  (C2) without the widened surface (C3) leaves the model blind on the delegating case;
  the widened surface (C3) without the hoist (C2) leaves §4.3 violated online. They
  are one behavior and must land together.
- **Blast radius is proportionate to commit size.** Commit 1 touches one shared
  function and is provable by unit tests plus one integration assertion. Commit 2 is
  where the fixture-corpus byte-identity proof does its work.

---

## §6. Pre-mortem — the coupled scope a builder will miss

**TRAP 1 (the big one) — three LG-006 tests become unreachable by construction.**
`tests/checks/lg006.test.ts:212`, `:225`, `:240` each build a repo containing ONLY
`HANDLER_NO_CANCELLATION` and then pass a fake judgment to `interpretLg006`. After
C2's hoist, that repo is **settled deterministically**, so those calls return
`fail`/`confirmed`/`1.0` and the tests fail. **The wrong repair is to weaken the hoist**
(e.g. only hoisting when `judgment === undefined`) — that reinstates the exact §4.3
violation this packet closes, and it will look like a green suite. **The right repair
is to re-base those three tests onto a delegating repo** (handler + `lib/events.ts`
carrying the branch), which is a genuine Layer-M case: the branch exists, the downgrade
is unproven, and the model is legitimately asked.

**TRAP 2 — the same trap at the integration level.**
`tests/scan/scanModel.test.ts:257` (`inferred blocker FAIL → not_ready`) and `:280`
(`contradictory`) both use `brokenCancellationRepo()`, which C2 settles. `:297`
(schema-valid) silently changes meaning for the same reason. `:257` re-bases onto the
**already-defined** `delegatingCancellationRepo()` helper (it exists at
`tests/scan/scanModel.test.ts:99`); `:280` re-bases onto a **new** prose-only-signal
repo. Do not delete these tests — the online `inferred`-fail path must stay proven.

**TRAP 3 — a fourth restatement of a path predicate.** `CODE_EXT_RE` lives private in
`src/scan/webhook.ts`. Copying it into `lg006.ts` recreates precisely the drift A-S1b
extracted the locator to prevent (and the residue already records `lg003.ts:51` as a
surviving third copy of the *webhook* predicate). One exported `isCodeFile`;
`webhook.ts` consumes it. **Proof that the migration is behavior-preserving:
`tests/scan/webhook.test.ts` must pass with ZERO assertion changes.**

**TRAP 4 — `collect.ts` is load-bearing.** `collect.ts:47`'s `node_modules` exclusion
is a standing constraint: the `stripe` package's own typings name
`customer.subscription.deleted`, and without the exclusion LG-006's blocker dies
silently on every Stripe repo. The `isCodeFile` export must be **purely additive**;
qa must show the exclusion set byte-identical and the diff additive-only. Note the
constraint now binds twice as hard: C3 surfaces *repo-wide* code files to the model,
so a vendored-dependency scan mode would also start feeding `node_modules` into
prompts.

**TRAP 5 — the SEC-5 blast radius widens.** C3 sends the model files it has never
seen before. If non-code files were surfaced, a scanned repo's own `README.md` /
`CLAUDE.md` / agent-spec files — which AI-built SaaS repos are full of — would be fed
straight into the prompt. The SEC-5 envelope fences them, but the correct bound is not
to surface them at all. The code-only rule is a **security** requirement of C3, not
just the mechanism behind the replacement guard. DC-6 asserts it.

**TRAP 6 — the wrong regression baseline.** A-S1b's published corpus hash
`sha256 c1f187c5…` / 64694 bytes is a **10-fixture** corpus from the `ed71d6e` era.
It is **NOT** the baseline for this packet. The builder must compute the **11-fixture**
serialized-report corpus hash at `e8f6f99` **before making any edit**, and qa must
compare against that. Using the published hash will look like a catastrophic
regression; ignoring the check will hide a real one.

**TRAP 7 — evidence vs. excerpts.** `request.excerpts` (what the model sees) and
`candidates.anchors` (what the deterministic finding cites) are different sets. C3
widens the former **only**. If widened excerpts leak into `anchors`, the deterministic
`fail`'s evidence changes, and `fixtures/broken-lg-006/expected.json`'s
`evidencePathContains: ["webhook/route.ts"]` plus the AT-26 assertions are put at risk
for no reason. Keep the finding anchor handler-scoped.

**TRAP 8 — the fact rename has no report surface, and that is the point.** LG-006's
supporting facts are **not** emitted into `report.facts` (`assembleReport` takes
`facts` from `detectStack` only). So retiring `fact:lg006.no-cancellation-branch`
rebaselines **no fixture and no report**. If any fixture output moves, something else
changed and the builder must stop.

### Fixtures needing repair or rebaselining

**None expected — and that is a proof obligation, not an assumption.** The offline
path is behaviorally unchanged by C1 (offline produces no judgment, so no contradiction
exists), by C2 (offline already evaluated the deterministic disjunct first), and by C3
(the request is built but never consulted offline and never serialized). Therefore:

- All **11** fixture serialized reports must be **byte-identical** to the `e8f6f99`
  baseline.
- `fixtures/broken-lg-006/expected.json` and `fixtures/broken-lg-004/*` are
  **untouched**. `git diff --stat` must show **zero** changes under `fixtures/`.
- **If any fixture output moves, the builder stops and reports rather than
  rebaselining.** A-S1b's `broken-lg-004` repair was a disclosed, adjudicated
  rebaseline; this packet authorizes none.

---

## §7. Adjudications the reviewer must make explicitly

1. **`fail` vs `unknown` for a contradictory judgment.** The packet chooses
   outcome `fail`, so §7 rule 5 fires and the finding lands in the "needs your
   confirmation" section rule 4 specifies. The alternative (`unknown` → rule 6) reaches
   the same decision value but makes **rule 5 dead code for every model-derived
   finding** and drops the disagreement out of the section the spec designed for it.
   Adjudicate whether `fail` is spec-faithful given the finding is not known to fail.
2. **Is `fact:lg006.no-code-cancellation-signal` an honest replacement guard, or a
   relocation of the defect?** Specifically: does the code/non-code split introduce a
   *new* species of wrong deterministic claim (e.g. a repo whose handling lives in a
   `.sql` migration or a `.prisma` schema)? Direction check required: the fact can only
   produce `contradictory` → warning, never a blocker, so the worst case is under-warn.
3. **Is the 5-file cap a new incomplete surface?** If ≥6 code files mention
   cancellation, the surfaced set is again partial. Mitigation argued in-packet: a repo
   mentioning cancellation in six code files plainly handles cancellation, the
   deterministic gate already forbids a `confirmed` blocker there, and the residual
   risk is an `inferred` model fail — the very failure mode being fixed. Adjudicate
   whether the cap, the ordering, and the elision disclosure are sufficient, or whether
   the cap should be removed entirely.

---

## §8. Assertion-change budget (binding)

This is the control that kept A-S1b and P-005 honest. It is unusually tight here, on
purpose: the offline path must not move at all.

### Commit 1 — **exactly ONE (1)** changed pre-existing assertion

| # | Location | Change | Why |
|---|---|---|---|
| 1 | `tests/scan/scanModel.test.ts:284` | `expect(finding?.classification).toBe('contradictory')` → `toBe('requires_confirmation')` | The decided report now has rule 5 applied, because the finding's outcome is `fail`. |

Permitted **additions** (not counted against the budget, but must be enumerated in the
receipt): an outcome assertion in `tests/model/inference.test.ts`'s contradictory block;
assertions that `decision.reasons` names rule 5 and `counts.warnings` increased at
`scanModel.test.ts:280`; the new DC-5 engine test.

### Commit 2 — **ZERO (0)** changed pre-existing assertions

Commit 2 changes **test inputs**, not assertions. Exactly six re-bases are authorized:

| # | Location | Re-base |
|---|---|---|
| 1 | `tests/checks/lg006.test.ts:212` | `HANDLER_NO_CANCELLATION`-only repo → delegating repo |
| 2 | `tests/checks/lg006.test.ts:225` | same |
| 3 | `tests/checks/lg006.test.ts:240` | same |
| 4 | `tests/scan/scanModel.test.ts:257` | `brokenCancellationRepo()` → `delegatingCancellationRepo()` (helper already exists) |
| 5 | `tests/scan/scanModel.test.ts:280` | `brokenCancellationRepo()` → new prose-only-signal repo |
| 6 | `tests/scan/scanModel.test.ts:297` | may keep `brokenCancellationRepo()`; its meaning changes to the deterministic path — disclose it, or split the case |

**These assertions must survive Commit 2 UNCHANGED — each is a guard:**

- `tests/checks/lg006.test.ts:67` — `excerpts.every(e => handlerPaths.includes(e.path))`
  (that test's repo has only the handler, so widening must not alter it).
- `tests/checks/lg006.test.ts:69` — `supportingFacts).toHaveLength(0)` on a
  branch-present repo (this is why no context facts are added).
- `tests/checks/lg006.test.ts:78-81` — still exactly one fact, still
  `establishesVerdict: 'fail'` (only its `id`/`statement` change; asserting the new id
  is an addition).
- `tests/checks/lg006.test.ts:101-210` — every offline interpret case.
- `tests/scan/webhook.test.ts` — **all of it**, zero changes: the behavior-preservation
  proof for the `isCodeFile` migration.
- `tests/scan/collect.test.ts`, `tests/scan/scanner.test.ts`, `tests/engine.test.ts`
  (pre-existing cases), `tests/cli/**`, `tests/harness.test.ts`, `tests/serialize.test.ts`,
  `tests/schema.test.ts`, `tests/registry.test.ts`, `tests/model/client.test.ts` — zero changes.

**BUDGET BREACH = STOP.** If Commit 2 requires *any* pre-existing assertion to change,
or Commit 1 requires more than the one above, the builder stops and reports rather than
expanding. That is a design signal, not a paperwork problem.

---

## §9. New tests required (Commit 2)

- **T1** — DC-1: `lib/events.ts` appears in `request.excerpts`, windowed, with a note.
- **T2** — DC-6: a repo with a `README.md` naming `customer.subscription.deleted`
  surfaces **no** non-code excerpt.
- **T3** — DC-2: online delegating repo + model `pass` → `pass`/`inferred` →
  `ready_with_warnings`.
- **T4** — DC-3: online branch-absent → `fail`/`confirmed`/`1` and
  `FakeModelClient.requests.length === 0`.
- **T5** — DC-4: prose-only signal + model `pass` → `contradictory`, outcome `fail`,
  decided `requires_confirmation`, rule 5 in `decision.reasons`, `ready_with_warnings`.
- **T6** — §4.3: the branch-absent LG-006 finding is identical offline and online.
- **T7** — DC-7: surfaced non-handler files are path-sorted and capped at 5; two
  fixed-clock runs byte-identical.

---

## §10. Proof obligations (qa — RED blocks close)

- `npm test` — exact pass/fail/skip counts and file count (base: **233 / 25**).
- `npm run typecheck` — clean.
- `npm run eval` — **11 fixtures / 11-of-11 decisions / 0 blocker false positives**.
- **Commit-1 isolation:** fresh worktree at Commit 1 + `npm ci` → suite green,
  typecheck clean, eval green. Report exact counts.
- **11-fixture corpus byte-identity** vs the baseline computed at `e8f6f99` *before any
  edit* (report both hashes and byte lengths). **Do not reuse A-S1b's `c1f187c5…`.**
- **Emit-only:** `src/decision/engine.ts` and `src/schema/index.ts` blob SHAs
  byte-identical to `6509b35`. Also expected byte-identical: `registry.ts`,
  `detectorKit.ts`, `lg003.ts`, `lg004.ts`, `lg015.ts`, `realClient.ts`,
  `bin/sugarbee.ts`, `src/cli/**`, and everything under `fixtures/`.
- **`collect.ts` additive-only:** show the diff; show the exclusion set byte-identical;
  restate why the `node_modules` exclusion still holds LG-006's blocker.
- **AT-23:** two fixed-clock `--offline` scans byte-identical on `broken-lg-006` and on
  the delegating temp repo.
- **AT-26:** the contradictory-derived `fail` carries non-empty evidence (guaranteed by
  cite-or-discard — verify, don't assume).
- **AT-27 restated and still closed:** the M-layer disjunct still degrades to `unknown`
  with the reason "model layer disabled"; the branch-absent case produces, needs, and
  fabricates **no** model result — now provably, via the zero-`infer`-calls assertion.
- **CEILING INVARIANT:** `hasAppSignal ⊇ scanner.supported` undisturbed; no unqualified
  `ready` across all 11 fixtures and every online probe. Note whether C1 partially
  retires qa's A-S1b caveat (the contradictory-pass case no longer depends on LG-015's
  incidental external marker to avoid rendering "pass").
- **Report surface:** the `requires_confirmation` finding renders in `reportMd`'s
  needs-confirmation grouping; `reportMd.ts` is unmodified.
- **Safety grep:** zero secret patterns on every surface (code, tests, packet, receipt,
  memory); no `process.env` / network / credential read in model or detector code; no
  new runtime deps; **no real model API call** — `FakeModelClient` only.
- **Assertion-change budget:** report the exact count against §8 and name every
  re-based input.

---

## §11. Binding carry-forward constraints

- **MODEL-LAYER SAFETY BOUNDARY** — credential boundary at `bin/sugarbee.ts` **only**;
  `RealModelClient` bin-only, built-in `fetch`, no SDK, no `process.env` in model or
  detector code; `FakeModelClient` drives every test; SEC-5 delimited untrusted data;
  cite-or-discard; at best `inferred`, capped **0.9**, never `confirmed`.
- **EMIT-ONLY** — engine + schema byte-identical. The model emits classification and
  confidence; §7's rules and the §5 schema do the rest.
- **REGISTRY IS THE SINGLE SOURCE** — severity/blocker/provider via `makeFinding`;
  `blocker` never hardcoded.
- **externalVerification OBLIGATION** — LG-006 carries none on any branch (correct,
  non-external). **LG-012 is the last pending external check and lands LAST (A-S7).**
- **TEST-DATA POLICY** — fake key literals keep short suffixes (<20 contiguous
  alphanumerics) and avoid any Sentry-DSN shape, on **every** surface including this
  packet, the receipt, and memory. Never allowlist a secret.
- **CEILING INVARIANT** — `hasAppSignal ⊇ scanner.supported`.
- **`node_modules` EXCLUSION IS LOAD-BEARING** — see Trap 4.
- **SHARED WEBHOOK LOCATOR — ONE CONTRACT** — import `locateWebhookHandlers`; never
  restate the predicate. The same rule now binds `isCodeFile`.
- **AT-23 determinism** — no set/hash iteration, no wall clock, no filesystem order.
- **Working contract** — verify the base at builder start; **≤2 commits**; **Commit-1
  green in isolation**; full proof + safety grep before close.
- **Process note** — **no Codex second-eyes pass is available in this environment**
  (`codex` not on PATH, no plugin). Review is single-model analysis plus empirical
  probes; do not overstate the proof standard in the receipt.

---

## §12. Tool Budget

`Tools: [Read, Grep, Glob, Bash, Edit, Write, builder, qa, reviewer, archivist] —
implement C1/C2/C3, prove the offline path is byte-identical, adjudicate three design
calls, and close with a receipt.`

Router row: **Build / feature / bugfix** (`build-os/memory/tool_router.md`) — builder →
qa → reviewer → archivist; ≤2 commits; Commit-1 green in isolation; no push/merge inside
the row. Second-eyes review (Codex) is **NOT AVAILABLE** in this environment; the
reviewer proceeds single-model plus empirical probes and says so.

**Budget breach = stop.** Any need for a tool, file, or authority outside this budget —
including any assertion change beyond §8 — is a hard stop for explicit go.

---

## §13. Hard stops (explicit go required)

- **Push** to `origin/claude/sugarbee-project-handoff-ic47uc` — permitted only under the
  standing feature-branch authorization, and only **after** qa green + reviewer pass +
  safety grep.
- **NO merge, NO pull request** — and per the standing flag there is currently **no
  default branch to merge into**.
- **No deploy, no secret read/write/rotation, no provider access, no real model API
  call.**

---
_Shaped by the build-orchestrator on 2026-07-25 from `e8f6f99`, on the user's explicit
go. A-S2 (LG-005) remains a staged candidate and is sequenced BEHIND this packet._
