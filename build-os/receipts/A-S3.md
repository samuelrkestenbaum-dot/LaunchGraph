# Receipt — A-S3: Phase 1 Repository Auditor — the `ModelCheck` seam + LG-009 (missing tenant-isolation evidence, Layer D+M) — Fork Branch A, Slice 3

- **Date:** 2026-07-26
- **Branch base (merge-base):** SugarBee.ai/LaunchGraph product repo, branch `claude/sugarbee-project-handoff-ic47uc`. The packet's two code commits sit on **`0e33643`** (*"Shape A-S3: the ModelCheck seam plus LG-009"* — **build-os only**, 1 file / 411 insertions / 57 deletions), itself directly on **`696518b`** (the A-S2 close commit). Builder verified the base at start; it had not moved. `git merge-base HEAD origin/main` → **`fatal: Not a valid object name origin/main`** — **this repo STILL has no default branch, FIFTH consecutive packet flagging it**; see Open boundaries. Pushed to the feature branch as a normal fast-forward **`0e33643..04a5ea0`**.
- **Baseline at `0e33643`:** 305 tests / 27 files, typecheck clean, eval 11 fixtures / 11-of-11 / 0 blocker FPs, detector coverage 10 of 15.

## Scope

- **In:** the generalized model-check seam, then the eleventh detector on top of it.
  1. **Commit 1 — the `ModelCheck` seam (pure refactor, zero behaviour change).** `src/model/modelCheck.ts` (types only, importing nothing from `src/checks/`); **LG-006 and LG-005 both migrated onto it**; `scanWithModel` reduced to one loop over a fixed, **append-only** array `MODEL_CHECKS` = `['LG-006','LG-005','LG-009']`, **sequential, no `Promise.all`**; `createScanner` iterates the *same* array, which is what stops a detector being wired into one path and not the other (the AT-27 defect class). `prefers` generalized from a single predicate to **ordered bands** (`readonly ((c)=>boolean)[]`), implemented as **successive filters over the remainder** rather than a sort — so the one-band case is literally the same two concatenated filters as before, **byte-identical by construction**, not by an argument about sort stability. `DelegatedSurface` gains `elidedByBand`, always summing to `elided`. The duplicated `elisionDisclosure` / `withheldNonSourceDisclosure` pairs folded into `src/scan/surface.ts`, zero copies left in `lg005.ts`/`lg006.ts`. A literal-carrying pin (`tests/model/questionPin.test.ts`) holds **both** transmitted questions on a repo exercising **both** disclosures at once, written out in full rather than re-derived.
  2. **Commit 2 — LG-009**, plus **SQL comment stripping** implemented as a **string-aware walker, not a regex**, applied at carrier read time.
- **Out (explicit):** **LG-009's `confirmed` fail branch** — withheld at shaping time on the settled reading (see THE CENTRAL OUTCOME). **LG-009's `confirmed` pass branch** — implemented, reviewed, fixed twice, then **withdrawn mid-packet by user decision** (same section). `fixtures/broken-lg-009/` — **not added; zero fixture movement, no repair**; eval stays at 11 fixtures and **AT-09 is explicitly OWED**. Surfacing `.sql`/`.prisma` into `request.excerpts` — still needs its own SEC-5 adjudication; the D layer reads them directly instead, with **no new capability**. Widening `isCodeFile` / `isModelSurfaceableFile` / `PROSE_EXT_RE`. Migrating `lg003.ts:51`'s webhook copy or the three private `CODE_EXT_RE` copies. LG-007/011/012/013; engine/schema change; `detectStack`/`supported`/LG-015's gate; `collect.ts`'s exclusion set; `golden/` (AT-16); `hostile/` (AT-18/20/21/22); SEC-5 delimiter-token hardening; spec-header staleness; `report.repo.commit`; the Express/Vite/Fly (Gravito) recipe. Import resolution — **not revived**. **No real model API call** — `FakeModelClient` drove every test. No merge, no PR, no deploy, no secrets.

## Commits

- **`406d81b`** — *Extract the ModelCheck seam; ordered prefers bands; fold the disclosure helpers — Commit 1* — 8 files, 614 insertions / 121 deletions: `src/model/modelCheck.ts` (68, new), `src/scan/surface.ts` (118), `src/checks/lg006.ts` (93), `src/checks/lg005.ts` (77), `src/scan/scanner.ts` (64), `tests/model/modelCheck.test.ts` (137, new), `tests/model/questionPin.test.ts` (96, new), `tests/scan/surface.test.ts` (82).
- **`04a5ea0`** — *Add LG-009 (missing tenant-isolation evidence), with BOTH deterministic branches withheld — Commit 2* — 4 files, 1214 insertions / 1 deletion: `src/checks/lg009.ts` (566, new), `tests/checks/lg009.test.ts` (568, new), `tests/scan/scanModel.test.ts` (78), `src/scan/scanner.ts` (3).
- Commit 2 was **amended four times** — `6f677d3` → `913e2c5` → `428f113` → `04a5ea0` — carrying the four adversarial review rounds and, finally, the withdrawal of the certifying branch. **Commit 1 was unchanged throughout**, so its isolation proof stands as taken. Per the standing constraint, `HEAD` was verified before each amend.
- **`0e33643`** — *Shape A-S3: the ModelCheck seam plus LG-009* — `build-os/packets/active_packet.md` only (411 insertions / 57 deletions). **Not part of the packet's ≤2** — Build OS state, touches no product code; the ≤2-commit contract is honored by `406d81b` + `04a5ea0`.
- Branch tip and code tip both **`04a5ea0`**.

## QA proof

*(All figures qa-verified independently at `04a5ea0`.)*

- **Suite:** `npm test` → **387 passed, 0 failed, 0 skipped, 30 files** (base `0e33643` was **305 / 27**) → **+82 tests, +3 files**. `npm run typecheck` (`tsc --noEmit`) **clean**.
- **Eval:** `npm run eval` → **11 fixtures, 11-of-11 decisions correct, 0 blocker false positives** — unchanged. **LG-009's contribution to that result is exactly zero.**
- **Commit-1 isolation:** fresh worktree @ **`406d81b`** + `npm ci` → **323 passed / 29 files**, typecheck clean, eval **11/11, 0 blocker FPs** → **GREEN**.
- **Emit-only preserved — blob-identical to base at BOTH commits (DC-6):** `src/decision/engine.ts` **`54b09905…`**, `src/schema/index.ts` **`c1ae2957…`**, `src/scan/collect.ts` **`0a39569a…`**, `src/scan/webhook.ts` **`5baf480a…`**, `src/checks/registry.ts` **`b4dd02d4…`**, `src/model/inference.ts` **`f12e8f52…`**. Verified at close.
- **Zero fixture movement:** the `fixtures/` tree object is **`a981446bac76039147d93efedd14a092c2aeadc1`** at **both** `0e33643` and `04a5ea0` — identical. Third consecutive packet at zero movement.
- **Per-fixture normalized report hashes.** Convention in full: **sha256 of `serializeReport(report)` with `report.repo.root` replaced by the literal `<ROOT>`, first 16 hex, at fixed clock `2026-07-23T00:00:00.000Z`.**

  | normalized sha (16) / bytes | fixture |
  |---|---|
  | `06d1d1a4b58217a8` / 6441 | `broken-lg-001` |
  | `f36b117d02ee4cd8` / 7444 | `broken-lg-002` |
  | `cbf70cb2b4579a3e` / 7602 | `broken-lg-003` |
  | `9a7fc6cb2a2b6ddb` / 8886 | `broken-lg-004` |
  | `a2e9caf5144d4559` / 8678 | `broken-lg-006` |
  | `ccc921a3bdfd17e2` / 6832 | `broken-lg-008` |
  | `c8469f55a9a394ab` / 6785 | `broken-lg-010` |
  | `e44b4b7026b43186` / 7290 | `broken-lg-014` |
  | `ba827eda109fc6b1` / 6161 | `broken-lg-015` |
  | `0e65cfebda144f90` / 6118 | `clean-min` |
  | `be390c741a9ccc7c` / 4960 | `unsupported` |

  **All 11 frozen at Commit 1 — equal to the A-S2 receipt table exactly (DC-2 confirmed)**, so the offline path provably did not move under the extraction. **All 11 moved at Commit 2**, each gaining **exactly one LG-009 `not_applicable` finding** — **including `fixtures/unsupported`**, per A-S2 Amendment 2's established behaviour. Stated up front in the packet, not as a mid-packet amendment.
- **What did NOT move at Commit 2:** all 11 **decisions**, all 11 **exit codes**, every fixture's `counts.{blockers,warnings,unknowns}`, eval **11/11 / 0 blocker FPs**, and the `fixtures/` tree object. `src/eval/harness.ts:269` scopes relevance to `outcome === 'fail' || 'warning'`, so a `not_applicable` is inert for eval **by construction**.
- **Assertion-change budget: 0 of 5 used — the first packet in this program to spend NONE.** Commit 1 used 0 of its permitted 0; Commit 2 used 0 of its permitted 5. The 22 assertions removed during the amend sequence were **all** in `tests/checks/lg009.test.ts`, a file that **does not exist at base** — they belonged to the withdrawn certifying branch and were never pre-existing assertions. None of the enumerated permitted changes (1–5) was needed; none of the forbidden files moved.
- **SEC-5 blast radius bounded (DC-13):** across every `InferenceRequest` built by **LG-005, LG-006 and LG-009**, on a repo containing `.sql`, `.prisma`, `.md`, `.mdx` and `.env` — **zero** excerpts whose extension falls outside `{ts,tsx,js,jsx,mjs,cjs,mts,cts}`. `isCodeFile`, `isModelSurfaceableFile`, `PROSE_EXT_RE` byte-identical to base.
- **DC-12 — SEC-5 trusted-region injection, the top trap:** no repository-derived free text reaches `question` or `SupportingFact.statement`. Identifiers validated `^[A-Za-z_][A-Za-z0-9_]{0,62}$`, deduped, sorted, capped at 10; failures dropped and counted. Proven with a **hostile-identifier test**.
- **DC-14 — `--checks` suppression is now structural:** `scanWithModel` makes **zero** `infer` calls for a check excluded by `--checks`, asserted **per check id for LG-005, LG-006 and LG-009 individually**. Calls remain sequential in the fixed append-only order; no `Promise.all`.
- **DC-10 headline — asserted directly:** there is **no code path** by which LG-009 emits `outcome: 'fail'` with `classification: 'confirmed'`, plus a grep-level assertion that `lg009.ts` contains **no `establishesVerdict: 'fail'`**. As landed, LG-009 emits **no `confirmed` verdict of any polarity**.
- **DC-11 — incomplete-surface suppression:** when `elidedByBand[0] + elidedByBand[1] > 0`, a model `fail` verdict yields **`unknown`** with the disclosed reason, never `fail`. A model `pass` is unaffected. **Asymmetric by design: incompleteness can only hide exoneration.**
- **Offline behaviour, proven across all 11 fixtures plus synthetic shapes:** LG-009 emits **only `not_applicable` or `unknown` offline, and contributes no fail, no warning, and no blocker to any offline scan, ever.**
- **AT-23 determinism holds on both paths:** two fixed-clock `--offline` scans byte-identical; two fixed-clock online scans with a deterministic `FakeModelClient` byte-identical; repeated surfacings → **1 distinct ordering**.
- **`node_modules` exclusion re-verified load-bearing — now FOUR ways over:** `IGNORED_DIRS` byte-identical. Vendored packages ship `.sql`/`.prisma` files and `organizationId` columns, which would flood LG-009's applicability *and* its surface, on top of LG-006's blocker, the prompt surface, and LG-005's delegated surface.
- **CEILING INVARIANT:** holds, structurally. `scanner.supported` and LG-015's gate untouched; LG-009's `not_applicable`/`unknown` feed Rule 6 at most, **reinforcing** the ceiling. No unqualified `ready` on any fixture or probe.
- **Registry stays the single source** — LG-009's `blocker` severity comes from the registry via `makeFinding`, never hardcoded.
- **Safety grep: clean.** Zero secret patterns across both commit trees, the packet, this receipt, and memory. No `process.env` / network / credential read in model or detector code. No new runtime deps. **No real model API call** — `FakeModelClient` only. TEST-DATA POLICY satisfied on every surface.
- **UI smoke:** N/A (detector packet, no UI). Report surface verified read-only; `reportMd.ts` unmodified.

## THE CENTRAL OUTCOME — LG-009 ships with BOTH deterministic branches withheld

**No `confirmed` fail. No `confirmed` pass.** LG-009 emits only `not_applicable`, `unknown`, or model-derived `inferred` verdicts capped at 0.9. It is the **first check in this program with both deterministic branches withheld**.

### The fail branch — withheld at shaping time

On the orchestrator's settled reading: a complete, uncapped deterministic read of migrations licenses a `confirmed` **pass** and a `not_applicable`, but **not** a `confirmed` fail — because **absence of RLS is not evidence of missing isolation** when application-layer scoping is legitimate and, in this program's target population, more common. Five false-blocker routes were found at shaping time (**FB-1..FB-5**); **FB-1 — a Prisma `$extends` app — is the modal architecture of the target population**, not an edge case. A `confirmed` fail would have been the first false blocker in this program **not** ceilinged at `inferred`, reaching Rule 2 → `not_ready` with no Phase-1 appeal.

### The pass branch — withdrawn mid-packet by USER DECISION

A certifying branch was implemented, reviewed, fixed twice, then withdrawn after **seven false-certification routes** were found across **four adversarial passes** — and every pass found new ones.

| # | Route | Disposition |
|---|---|---|
| 1 | `USING (true)` alongside a strict policy (permissive policies OR) | fixed, then moot |
| 2 | line-commented RLS (`--`) | fixed, then moot |
| 3 | block-commented / unterminated / nested | fixed, then moot |
| 4 | later `DISABLE ROW LEVEL SECURITY` | handled by the withdrawn branch |
| 5 | later `DROP POLICY` | **never fixed — cannot fire** |
| 6 | later `DROP TABLE` + recreate | **never fixed — cannot fire** |
| 7 | `USING (1=1)` tautology | **never fixed — cannot fire** |
| 8 | RLS DDL inside a string literal (**certified a repo with ZERO RLS**) | **never fixed — cannot fire** |
| 9 | partial child-table coverage | handled by the withdrawn branch |

**The deciding argument.** Because the Phase-1 ceiling is **structural**, **`pass` and `unknown` produce the identical decision and the identical exit code**: LG-009 `unknown` → Rule 6 → `ready_with_warnings`, and `pass` → LG-015's pending external still forces Rule 6 → `ready_with_warnings`. The branch bought **a line of report text and a skipped model call**, against the risk of certifying tenant isolation on a repository that has none. What settled it was not the length of the list but that **it kept growing** against a benefit close to nil.

**Routes 5–8 are unreachable BY ABSENCE OF THE BRANCH, not by patching.** That is the right kind of closure.

## What LG-009 can and cannot answer

**Can:**
- Determine that a repo **declares a tenancy boundary** in an in-repo schema — a table/model matching the tenancy name set **AND** ≥1 *other* table declaring a column referencing it. **The foreign-key conjunct is what kills FB-3** (a reference-data `Organization` table is not a tenancy boundary).
- **Rule itself out** when it does not — `not_applicable`, settled, zero `infer` calls.
- **Surface the application code most likely to contain scoping**, ranked **mechanism-first** across three ordered `prefers` bands.
- **Ask a model** whether that code scopes queries, and report `inferred` pass/fail **capped at 0.9**.
- **Refuse to report `fail` when the cap ate the exonerating band** (DC-11).

**Cannot:**
- **Assert that a repository *is* isolated.** No `confirmed` pass exists.
- **Assert that a repository *is not* isolated.** No `confirmed` fail exists.
- **There is no deterministic verdict beyond applicability.**

**Offline — which is what eval and every fixture exercise — LG-009 emits only `not_applicable` or `unknown`, and contributes no fail, no warning, and no blocker to any offline scan, ever.**

## Detector count — RECORD ONLY IN QUALIFIED FORM

**11 of 15 implemented — of which 8 can move an offline decision, and 3 (LG-005, LG-006's M half, LG-009) are online-only or partly so.** LG-009's contribution to the 11/11 eval result is **exactly zero**, and it advances §9.3's 15/15-recall and 18/18-decision thresholds **not at all**. **"11 of 15" must not stand unqualified anywhere.**

## Review

- **Verdict: PASS.** qa **GREEN** at `04a5ea0`.
- **The certifying branch was killed by adversarial probing, not by the suite.** Four passes, seven routes, each pass finding new ones. The worst: an `INSERT` of documentation text naming `ENABLE ROW LEVEL SECURITY` inside a **string literal** certified a repository with **zero RLS**.
- **The withdrawal produced STRONGER evidence for Commit 1 than the original argument did** — see Corrections #1.
- **Codex second-eyes: NOT AVAILABLE — no second-eyes pass ran, for the FIFTH consecutive packet.** `codex` is not on PATH and no plugin is present. The reviewer inventoried the connected MCP servers (Apollo, Clay, GitHub, Higgsfield, Hugging Face, Otter, Supabase, Zapier) and **confirmed none is a code-review tool**. GitHub MCP could host a PR review, but there is no branch to open a PR against; Supabase MCP is a *live project* tool whose use would be an external-mutation boundary, not a review. **At five packets, and with seven certification defects found by adversarial passes rather than by the suite, this is recorded as a STANDING PROCESS RISK, not a footnote.**
- **Product Trajectory Check:** detector coverage **10 → 11 of 15, qualified as above**. Remaining: **LG-007, LG-011, LG-012, LG-013**. Engine + schema untouched; registry stays the single source; LG-009 carries no `externalVerification` on any branch (correct — §3 External = No), so **LG-012's external path (A-S7) stays untrodden**.

## Corrections that must land in the record

1. **Commit 1's justification CHANGED, and the honest version is better.** The seam was justified as fitting three consumers settling three ways — **{settles-fail, settles-nothing, settles-*pass*}**. With the pass branch withheld, the **true base is {fail, nothing, nothing}** — the settles-`pass` shape was never exercised. **But the withdrawal produced stronger evidence than the original argument.** LG-009 changed settle-shape **late in the packet**, and the seam absorbed it with **exactly one line** (`MODEL_CHECKS` gains `lg009ModelCheck`) plus an import, with `src/model/modelCheck.ts` (`108c4ed9…`), `src/scan/surface.ts` (`9686e0fd…`), `src/checks/lg005.ts` (`5bcb6c02…`) and `src/checks/lg006.ts` (`a79097b2…`) **byte-identical between Commit 1 and the final Commit 2**. An interface that survives its motivating consumer changing shape mid-packet is **better evidenced** than one that fit three consumers on paper. The **load-bearing property is the POLARITY argument**: `request: undefined` cannot accidentally mean *ask anyway*, whereas a boolean predicate's plausible default (`() => false`) would ship an `infer` call — repository text off-process — for an already-decided check. **Both the honest base and the superseding evidence are recorded.** **The settles-`pass` shape is now UNPROVEN AND OWED** — LG-012's `externalVerification`-on-unknown is the next structural variant due.
2. **A main-session framing error, corrected by qa.** The main session proposed recording the surviving residual (R-A) as *"a silence-only limit, not falsity."* **That is BACKWARDS.** Not scanning a file makes `noRlsFound` **more** likely true, so the fact is **more** likely emitted **and false**. **Widening the scan silences; narrowing falsifies.** The corrected framing is what stands.

## Residue

**Deferred / follow-up:**

1. **R-A (OWED) — the surviving carrier residual, and it is FALSITY, not silence.** `noRlsFound` scans every `.sql`/`.prisma` file, comment-stripped. RLS expressed in **any other carrier** — `.psql`, `.pgsql`, extensionless, or a `.ts`/`.js` migration template string (Drizzle `db.execute(sql\`…\`)`, Knex `knex.raw`) — is **invisible to the scan**. So **on a repo that declares tables in `.sql`/`.prisma` but applies RLS elsewhere, `fact:lg009.no-rls-in-migrations` is emitted and FALSE**. **Narrower than the carrier-scoped defect it replaced, but the SAME CLASS.** Bounded: no `establishesVerdict`, the statement self-hedges, ceiling `inferred` → Rule 3. **Further widening is NOT free** — scanning all text files would *silence* the fact on any repo whose README merely mentions the phrase, degrading true context. **Where the scan boundary belongs is a design decision, not a patch.** One-line partial close if wanted: add `psql|pgsql` to the scan regex — **monotone in the safe direction**.
2. **R-B (cosmetic).** Stale comment at `src/checks/lg009.ts:377-378` describing carrier ordering and `DISABLE` logic that went out with the withdrawn branch. Zero risk; sweep when the file is next opened.
3. **R1 — REFRAMED, and this is important. R1 is NOT a narrow carve-out; it is the GENERAL FORM of the only Phase-1-defensible certification.** Reinstating any certification needs: **(1)** a real **SQL statement parser** replaying statements in order — which kills the lexical and lifecycle defeater classes **structurally**, not by patching; **(2)** a **default-deny defeater denylist**; **(3)** evidence that the **connecting role is subject to the policies**. **Requirements 1–2 are Phase-1-achievable; requirement 3 is Phase-3 external verification** — which role the runtime connection authenticates as is **not a repository fact** (§1.2), and Supabase's `service_role` bypasses RLS wholesale. Since 3 is unanswerable from a repository, the **only Phase-1-defensible shape is the one where the repository itself constrains the connecting role** (a browser-scoped anon client). **Record as "blocked on Phase 3 unless scoped to R1."**
4. **AT-09 IS OWED — recorded exactly as AT-05 was — and there is NO EVAL PATH TO CLOSE IT.** Eval runs the **offline** scanner and LG-009 has **no offline verdict** beyond `not_applicable`/`unknown`, so a `broken-lg-009` fixture would assert a shape it cannot exercise. **That is precisely the defect qa found in A-S2's committed Trap-9 check** — direction checks must exercise the shape whose name they carry.
5. **FB-5 vocabulary gap** — a tier list of `tenant_id`/`organization_id` misses `orgId`, `workspaceId`, `teamId`, `accountId`, `companyId`. Carried forward from A-S2's DC-11 discussion.
6. **The settles-`pass` `ModelCheck` shape is UNPROVEN AND OWED** — see Corrections #1. LG-012's `externalVerification`-on-unknown is the next structural variant due (A-S7).
7. **NO CODEX SECOND-EYES PASS RAN — FIFTH CONSECUTIVE PACKET, now a STANDING PROCESS RISK.** See Review. Not a footnote.
8. **Carried forward — this repo STILL has NO DEFAULT BRANCH. FIFTH packet flagging it.** No `main`/`master`, locally or on the remote; `origin/HEAD` unset. "Never merge without go" has **no target**; a PR has **nowhere to land**. **Needs a user decision, not a sixth carry-forward.**
9. **Carried forward, all still open:** the **`.sql`/`.prisma` prompt-surface SEC-5 adjudication** (A-S3 did not need it — the D layer reads them directly — but it is still owed for `request.excerpts`); **`prefers` re-weights rather than cures** (the inversion, six-specific-band, and generic-only-guard shapes); the three private `CODE_EXT_RE` copies (`lg003.ts:35`, `lg015.ts:39`, `lg010.ts:62`) **+ `lg003.ts:51`**'s webhook-predicate copy; **per-check model-error degradation**; **AT-05**; **AT-06's model-assisted half**; **AT-16 `golden/`**; **AT-18/20/21/22 `hostile/`**; **§9.3's 15/15-recall and 18/18-decision thresholds** (eval stays at 11 fixtures); SEC-5 delimiter-token hardening; spec-header staleness; `report.repo.commit` null; the banner locator artifact on fixture scans; LG-006's comment-suppression recall cost and anchor-excerpt fidelity note; `fixtures/broken-lg-006`'s five-level import depth; LG-008's optional warning for a lone committed DB URL; LG-003 provider-agnostic webhook presence; LG-010's last-two-labels domain heuristic; LG-014's implicit/dashboard-only Sentry mechanisms; LG-001 source-path scanning; harness greedy-matching debt; the `@unique`/`@@unique` disclosure-only note; the Gravito governance gap and the Express/Vite/Fly recipe (visibility items).

**New standing guidance produced by this packet** — recorded in full in `build-os/memory/residue.md` under Standing constraints:

- **THE DEFEATER TAXONOMY** (six classes, split 1–5 / 6), applying to any branch that **certifies** *or* **asserts a deterministic claim into a prompt**.
- **DENYLIST OF DEFEATERS, NOT ALLOWLIST OF POSITIVES.**
- **THE WIDENING-DIRECTION RULE**, and its earned corollary: *widen the search for a signal; keep narrow the predicate that gates applicability* — and **parameterize them separately**. `rlsScanText` vs `isSchemaCarrier` is the reference implementation. **Third independent arrival at the same shape.**

**Known risks / carry-forward obligations still binding:**
- **MODEL-LAYER SAFETY BOUNDARY** — credential boundary at `bin/sugarbee.ts` only; `RealModelClient` bin-only, built-in `fetch`, no SDK; no `process.env` / network / credential read in model or detector code; `FakeModelClient` drives every test; SEC-5 delimited untrusted data; cite-or-discard; at best `inferred`, capped 0.9, never `confirmed`. Preserved, and now **stricter**: `--checks` suppression is structural rather than per-check.
- **EMIT-ONLY ENGINE + SCHEMA** — blob SHAs unchanged; re-verified at close.
- **REGISTRY IS THE SINGLE SOURCE** — severity/blocker/provider via `makeFinding`; never hardcoded.
- **externalVerification OBLIGATION** — LG-009 carries none on any branch (correct, non-external); **LG-012 remains the last pending external check (A-S7)**.
- **TEST-DATA POLICY** — <20 contiguous alphanumerics on every key-shaped fake, no Sentry-DSN shape, on every surface including this receipt and memory; never allowlist a secret.
- **CEILING INVARIANT** `hasAppSignal ⊇ scanner.supported` — structural; LG-009's `not_applicable`/`unknown` reinforce it via Rule 6. **It is also what made the pass-branch withdrawal free.**
- **`node_modules` EXCLUSION IS LOAD-BEARING** — now **four** ways over.
- **`--amend` IS UNSAFE ON THIS BRANCH** — `HEAD` verified before each of Commit 2's four amends.

## Open boundaries (awaiting explicit go)

- **Push:** executed under the standing feature-branch authorization AFTER qa green + reviewer pass + safety grep, landing as a normal fast-forward **`0e33643..04a5ea0`**.
- **This receipt and the memory updates are NOT committed** — the user handles commit and push. Per the standing constraint, all `build-os/` commits are held until the packet closes.
- **NO merge to any default branch and NO pull request** — both await explicit approval, and per Residue #8 there is currently **no default branch to merge into**. Fifth packet flagging it.
- No deploys, no secrets touched or allowlisted, no provider access. **No real model API call occurred** — `FakeModelClient` drove every test; the model layer's runtime egress only activates when a real model is configured at the bin, which did not happen.
