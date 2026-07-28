# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **EV-001** — *Allocate the evidence method per check; restate the
  Phase-1 boundary* — **OPENED and CLOSED 2026-07-28.** *(This file previously read
  "Status: NONE ACTIVE" for the whole of EV-001 and never named it — both its open and
  its close are recorded here, at close, so the gap is visible rather than silent.)*
  qa **GREEN on DC-1..DC-12, DC-14, DC-15; RED on DC-13, now fixed**; reviewer
  **fix-then-pass (recorded as fixed)** with **all four required fixes applied**.
  **ONE commit `258cc70`** (2 files, **+497/−2**) on base **`9706d87`** — originally
  `e3c0425`, **amended once** to fold in the qa and reviewer fixes (HEAD verified to be
  our own unpushed commit first, per the standing `--amend` constraint). **ZERO PRODUCT
  CODE.** **≤2 commits held.** Receipt: **`build-os/receipts/EV-001.md`**.
- **NEW SERIES `EV-NNN`** — evidence-method allocation and phase-boundary doctrine;
  packets that produce a **durable decision artifact and ship no product code**.
  **Forced by existing namespace rules, not preference:** `P-0NN` is **FROZEN**
  (collides with canonical's `P-001…P-025`); **`A-S*` is reserved for the detector
  fork** and **a non-detector packet must never consume a slice number** — taking
  **A-S4's** number would have made a **pause look like a completion**; `T-NNN` is the
  Build OS **runtime** series, whereas EV-001's subject is the **product's evidence
  architecture**. **Rejected:** `D-`/`M-` (collide with Layer D / Layer M), `PL-`
  (reads near the frozen `P-`), `S-` (reads as the A-S slice suffix).
- **EV-001 HEADLINE — THE STRATEGIC REFRAMING IS A *RECOVERY* OF THE FOUNDING
  ARCHITECTURE, NOT A PIVOT.** `PRODUCT_SCOPE.md` §35 already assigns the phases
  (**`:1598` Phase 1 Repository auditor · `:1614` Phase 2 AGENT COORDINATOR · `:1626`
  Phase 3 PROVIDER INSPECTOR AND ROUTER · `:1640` Phase 6 VERIFICATION**) and the Phase
  1 spec's §13 already defers most of the allocation (`:646`, **`:647` external-side
  resolution of LG-003/010/012/014/015**, `:648`, `:651`). **Recording "Phase 2" for
  provider/live evidence would have been WRONG** — Phase 2 is the agent coordinator —
  **and would have implied the numbering was informal, which is the crack the boundary
  leak comes through.** **LG-009 is the SINGLE genuine departure from the spec**
  (`P1§3:120` marks it `External component: No`; it is **absent** from §13's `:647`
  row) and is recorded as a **PROPOSED** amendment (§9.1), **NOT enacted** — **`P1§3`'s
  cell wins today.**
- **EV-001 NUMBERS:** tests **387 / 30**; typecheck **exit 0**; eval **11/11 · 0 blocker
  FPs**; diff **exactly 2 files**; subtrees byte-identical (`src` `30f116ff`, `tests`
  `496e919b`, `bin` `49442941`, `build-os` `b4be19ff`, `.claude` `1c0e5943`);
  **SIXTH consecutive zero-fixture-movement packet** (`fixtures` tree
  `a981446bac76039147d93efedd14a092c2aeadc1`); **assertion budget 0**;
  **`P1§3`/`§10`/`§13` byte-identical base↔HEAD**; both panels **15 unique ids, exactly
  30 `^| LG-` lines**; **boundary grep — zero imperatives, zero SDK names, ZERO
  URL/host literals doc-wide**; safety grep clean; ClaudeOrchestrator clean at
  `0a63f66`.
- **EV-001 — NO SECOND EYES.** `codex` absent from PATH, no plugin route, and the only
  live Codex channel is the **GitHub PR bot, which needs a push**. **No independent
  second-model pass happened on EV-001 — do not record one, and do not read T-002's
  "second eyes obtained" as covering it.** **Standing qualifier: PROSE REVIEW IS WEAKER
  EVIDENCE THAN CODE REVIEW** — no test fails if a sentence is misread; the failure
  mode is a reading three sessions from now under delivery pressure.
- **Previously closed:** **T-002** — *Pin the Build OS source; close the long-carried gaps* —
  **CLOSED 2026-07-27**. qa **GREEN (DC-1..DC-7)**, DC-8 recorded as a finding;
  reviewer **fix-then-pass (recorded as fixed)**. **One commit `c7baff9`** (2 files,
  +3/−2) on base **`8652bac`**; a local `git remote set-head` repair rode along (a ref
  change, in no diff). **≤2 commits held.** Receipt: **`build-os/receipts/T-002.md`**.
- **Previously closed:** **T-001** — *Adopt canonical ClaudeOrchestrator Build OS tooling
  into the product repo* — **CLOSED 2026-07-26**. qa **GREEN, 10/10 gates**;
  reviewer **fix-then-pass (recorded as fixed)**. Commit 1 `4920653` (10 files,
  +1290/−2) on base `f6a74c0`; Commit 2 = the reviewer-required activation gate +
  receipt + memory (**committed by the user together with this close**).
  Receipt: **`build-os/receipts/T-001.md`**.
- **Also previously closed:** **A-S3** — Phase 1 Repository Auditor — the `ModelCheck`
  seam + **LG-009** (missing tenant-isolation evidence, Layer D+M) — **CLOSED
  2026-07-26**. qa **GREEN**, reviewer **pass**. Commits `406d81b` (C1) + `04a5ea0`
  (C2, amended four times: `6f677d3` → `913e2c5` → `428f113` → `04a5ea0`) on the
  build-os-only shaping commit `0e33643`. Pushed as fast-forward
  **`0e33643..04a5ea0`**. Receipt: **`build-os/receipts/A-S3.md`**.
- **T-002 HEADLINE OUTCOME — THE ROUTED MECHANISM WAS WRONG, AND THE HAZARD IS
  SELF-TRIGGERING.** The orchestrator routed a **frozen canonical clone**; **it does
  not close the hazard.** Three-arm control (canary appended to the MANAGED file
  `build-os/memory/tool_router.md`, bootstrap invoked exactly as the SessionStart hook
  does): **(a) unpinned → canary REVERTED; (b) pinned to a frozen canonical clone →
  canary REVERTED; (c) pinned to the project itself → `nothing to install`, canary
  SURVIVED.** Reproduced **independently by BOTH qa and reviewer**. **Structural, not
  versional:** a frozen clone still satisfies `is_canonical_src()`, so `SRC != TARGET`
  and the full stage→backup→promote path still runs — **freezing pins WHICH bytes get
  written, never WHETHER writes happen.** Arm (c) is a **TRUE ZERO-WRITE no-op**.
  **THE REVIEWER'S CONTROL DID NOT TAMPER THE MANIFEST: the canary edit ALONE flips the
  file-hash half of the cache gate (`project-bootstrap.sh:196-215`), so the hazard needs
  NO external ClaudeOrchestrator commit.** Fix: `env.BUILD_OS_SOURCE =
  "/home/user/LaunchGraph"` in `.claude/settings.json`. **IT FAILS OPEN — see the
  residue TOP ITEM before moving or re-cloning this repo.**
- **T-002 SECOND OUTCOME — SECOND EYES OBTAINED FOR THE FIRST TIME IN SIX PACKETS, AND
  THE SIX-PACKET "UNAVAILABLE" VERDICT WAS A MIS-DIAGNOSIS.** Every prior session checked
  `codex` **on PATH**; **Codex is configured as a GitHub PR review bot on this repo**
  (`chatgpt-codex-connector[bot]`), reachable via a PR all along — which nobody opened
  because *"this repo has no default branch"* was **false**. **§10.1 and §10.2 were the
  same defect.** The review found **two REAL PRODUCT DEFECTS on closed work** (inputs 10
  and 11 below), one **corroboration** of T-002's pin, and one **upstream** defect.
- **T-002 numbers:** tests **387 / 30**; typecheck exit 0; eval **11/11 · 0 blocker FPs**;
  Commit-1 isolation at `c7baff9` in a detached worktree **387/30 GREEN**; diff exactly
  two files; **FIFTH CONSECUTIVE ZERO-FIXTURE-MOVEMENT PACKET** (`fixtures/` tree
  `a981446bac76039147d93efedd14a092c2aeadc1`); pin survives `--force`; ClaudeOrchestrator
  clean and still `0a63f66`; safety grep clean; **assertion budget 0 of 5.**
- **T-001 headline outcome:** **the Build OS runtime is DURABLY CONFIGURED — not
  ACTIVE.** Installed ≠ activated. Its central finding is that **adoption activated a
  previously-dead prompt-classifying surface whose classifier is tuned to this
  project's own vocabulary** (`architecture review`, `eval harness`,
  `postgres … migration/schema` all route to **`ecc`**), and the `ecc`/`zeroize`
  routes perform **machine-global writes outside this repo**, register a
  **third-party MCP from GitHub**, and spawn an **autonomous `claude -p` child for up
  to 900s**. Gated in Commit 2 via `env.BUILD_OS_SPECIALIST_HANDOFF = "1"` in
  `.claude/settings.json` — placed there because `project-bootstrap.sh:322-350`
  mutates only `data["hooks"]`, so **the gate survives every canonical refresh**.
- **A-S3 headline outcome (unchanged):** **LG-009 shipped with BOTH deterministic
  branches withheld** — no `confirmed` fail, no `confirmed` pass.
- **Detector coverage — UNCHANGED BY T-001, T-002 AND EV-001, and record it
  QUALIFIED: 11 of 15 implemented, of which 8 can move an offline decision; 3 (LG-005,
  LG-006's M half, LG-009) are online-only or partly so.** None of the three touched a
  detector, a test, or a fixture. **"11 of 15" must never stand unqualified.** Tests
  **387 / 30**; eval **11 fixtures / 11-of-11 / 0 blocker FPs**; **SIXTH consecutive
  zero-fixture-movement packet** (`fixtures/` tree
  `a981446bac76039147d93efedd14a092c2aeadc1` — A-S1c, A-S2, A-S3, T-001, T-002,
  EV-001); **assertion budget 0 spent at A-S3, T-001, T-002 AND EV-001.**
- **THE TEST-DATA POLICY REMAINS IN FORCE ON EVERY SURFACE** — fixtures, tests,
  receipts, memory. Fake provider-key literals keep **short suffixes (<20 contiguous
  alphanumerics)** and avoid any Sentry-DSN shape. **Resolve push protection this way,
  NEVER by allowlisting a secret.**
- **THE SELF-UPDATING BOOTSTRAP IS SELF-TRIGGERING AND THE PIN FAILS OPEN** (T-002
  residue TOP ITEM). **Run `git status` on managed paths before ANY `build-os` commit.**
  Honoured at EV-001 close: the tree was clean before the receipt and memory writes.

---

## Next — **LG-005 delegated-helper hardening (staged candidate)**; **A-S4 is PAUSED**

### THE NEXT PACKET SHOULD BE CODE — staged candidate: **LG-005 delegated-helper hardening**

**Not shaped. Not authorized. Do not start.** The orchestrator shapes it; the user
gives the go.

- **WHY, AND IT IS A TRAJECTORY ARGUMENT, NOT A PREFERENCE: EV-001 IS THE THIRD
  CONSECUTIVE PACKET WITH ZERO DETECTOR MOVEMENT** (T-001, T-002, EV-001) **against
  FOUR unimplemented detectors (LG-007, LG-011, LG-012, LG-013) and TWO named open
  product defects. Doctrine is now well-capitalized relative to code.** Each packet was
  individually justified; **the PATTERN is the risk.**
- **Target: `src/checks/lg005.ts:203` — the `selects` predicate** (EV-001 §7.1). A
  webhook delegating to a helper that is **idempotent by construction** carries none of
  the event-id / upsert / dedup markers, so **`selects` EXCLUDES it** — the model cannot
  distinguish that safe path from a helper that inserts or mails on **every** delivery,
  **yet LG-005's verdict can still become a BLOCKER.** **Defeater class 6**, and an
  **ALLOWLIST OF POSITIVES where the governing rule requires a DENYLIST OF DEFEATERS.**
- **LINE NUMBER: `:203`, NOT `:205`.** Codex's citation (carried through T-002) is **off
  by two**: `:203` is `selects` (excluding), `:205` is `prefers` (ranking, excludes
  nothing). Verified at source at EV-001 close. **qa flagged it and the reviewer
  asserted the opposite; only direct verification settled it.**
- **WHY THIS ONE:** it is a **shipped, repository-authoritative detector that can
  currently manufacture a false blocker**, and **no provider and no probe can fix it** —
  it sits squarely inside Phase 1's own authority. **Hardening it is a better use of the
  same effort than a twelfth detector, and it HONOURS the A-S4 pause rather than working
  around it.**
- **A companion, NOT a substitute:** LG-009's unbanded elision (EV-001 §7.2) —
  `src/checks/lg009.ts:423` sums only `elidedByBand[0] + [1]`, omitting **exactly index
  2**, the trailing unbanded slot (`prefers` has **exactly two** predicates at
  `lg009.ts:412-415`, so `elidedByBand.length === 3`). **Establish the band count from
  the code, not from any report.**

---

### **A-S4 — PAUSED BY USER DIRECTIVE (2026-07-28). NOT CANCELLED, NOT ABANDONED, NOT SUPERSEDED.**

**Paused by the user; recorded by the archivist at EV-001 close.** **THE THESIS IS NOT
ABANDONED; THE BUILD SEQUENCE IS ADJUSTED.** **ALL ELEVEN BINDING SHAPING INPUTS BELOW
ARE PRESERVED IN FULL AND DELIBERATELY NOT CLEARED** — they remain binding the moment
A-S4 resumes. **EV-001 did NOT consume A-S4's slice number**, precisely so that a
**pause could never be mistaken for a completion**.

**Not shaped. Not authorized. Do not start.** The orchestrator shapes it; the user
gives the go. **T-001 did not alter a single one of A-S4's shaping inputs**, and
**T-002 altered none of the nine either — it ADDED TWO (inputs 10 and 11) and
DISCHARGED the two process inputs (8 and 9).** The nine original inputs are carried
forward intact; **inputs 10 and 11 are independently-sourced, concrete defects in
LG-005 and LG-009 and they bear directly on WHICH DETECTOR IS SAFEST TO BUILD NEXT.**

**Remaining detectors: LG-007, LG-011, LG-012, LG-013.**

### Binding shaping inputs

1. **THE DEFEATER TAXONOMY IS BINDING** — apply it to any branch that **certifies**
   (`pass`/`confirmed`) **or** asserts a deterministic claim into a prompt. Six
   classes, recorded with the split **1–5 = the text the scan SAW; 6 = text it
   NEVER READ**: (1) a sibling that overrides; (2) a later statement that revokes;
   (3) a lexical context that makes it inert; (4) a qualification mismatch that
   hides it; (5) a semantic equivalent unrecognised; (6) **a collection boundary
   that never read it**. Class 6 retroactively covers A-S1c's `.mts` gap and
   A-S2's 5-file cap, and **recurred within a single round at A-S3 as R-A**. Full
   text, including the builder's verbatim self-observation, is in
   `build-os/memory/residue.md` under Standing constraints.
2. **BOTH GOVERNING RULES ARE BINDING.**
   - **Denylist of defeaters, not allowlist of positives.** A missing positive
     costs a false `unknown` (safe); a missing defeater costs a false
     certification or a false assertion (unsafe).
   - **Widening-direction rule.** For any predicate gating a claim, state which
     direction widening its input moves the claim, and prefer the widening that
     can only weaken it. **Corollary:** *widen the search for a signal; keep
     narrow the predicate that gates applicability* — and **parameterize them
     separately**. Third independent arrival at the same shape (`selects`/`anchor`;
     `prefers` bands; `rlsScanText`/`isSchemaCarrier`): **when one predicate is
     doing two jobs, split it before something silently widens the wrong one.**
3. **LG-011 IS NOT THE SAFE OPTION.** Examined at A-S3 shaping and found to walk
   straight into the `process.env.X ?? 'http://localhost:3000'` dev-fallback idiom
   **this program already refused once** (LG-001 source-path scanning, P-003-S2),
   at **`confirmed` / Rule 2 / `not_ready` with no override** — the same worst-case
   setting LG-009 carried, on a hazard already documented as real. It also has its
   own carrier problem (`.html`/`.mjml`/`.hbs` are not `isModelSurfaceableFile`)
   with **no** "the D layer may read it completely" escape, because the answer
   depends on *resolution* of an env variable, not the presence of a literal.
   **It is UNEXAMINED, which reads as lower risk and is not.**
4. **LG-012 IS THE LAST EXTERNAL CHECK AND LANDS LAST (A-S7).** It is also the
   **owed structural variant for the `ModelCheck` seam** — the settles-`pass`
   shape the seam was justified against is currently **unproven**, and LG-012's
   `externalVerification`-on-unknown is the next genuinely different shape.
5. **R1 is the general form of the only Phase-1-defensible certification**, and it
   is **blocked on Phase 3 unless scoped to R1** (a repository that itself
   constrains the connecting role). Do not let a later slice reinstate LG-009
   certification without a real SQL statement parser **and** a default-deny
   defeater denylist **and** role evidence.
6. **AT-09 is owed with NO EVAL PATH to closure**; **AT-05 likewise owed.**
7. **Zero-fixture-movement posture** has now held for **FIVE** consecutive packets
   (`fixtures/` tree `a981446bac76039147d93efedd14a092c2aeadc1` — A-S1c, A-S2, A-S3,
   T-001, **T-002**). Any A-S4 fixture change is a disclosed decision, not a default.
8. **~~STOP — no default branch, SIXTH packet flagging it, BLOCKING.~~ DISCHARGED AT
   T-002 — AND THE PREMISE WAS FALSE.** The repo **had** a default branch
   (`claude/launchgraph-product-scope-43pgdx` @ `a00d194`); only
   `refs/remotes/origin/HEAD` was unset **in the local clone**. **G1a/G1b/G1c CLOSED**:
   `origin/HEAD` → `origin/main`, `merge-base HEAD origin/HEAD` → **`8652bac`**;
   **PR #1 open** (head `…-tdfylf`, base `…-43pgdx`, 20 commits) as a **REVIEW VEHICLE,
   NOT proposed for merge**; **`main` created at `8652bac`** — a new name on existing
   history, **every SHA in every receipt stays valid**. Both were **explicitly
   authorized** by the user ("Both: create main AND PR now"). **G1d REMAINS OPEN and is
   USER ACTION ONLY** — no MCP tool can set a repository default branch and `gh` is
   absent; **`origin/HEAD` is a LOCAL ref that `git remote set-head -a` would revert to
   `a00d194` (three commits behind, off this lineage) until the repo default changes.**
   **A-S4 does not need to solve this; it must not assume it is solved.**
9. **~~Second-eyes is unavailable and is a STANDING PROCESS RISK.~~ DISCHARGED AT
   T-002 — THE COUNT STOPS AT SIX, AND THE DIAGNOSIS WAS WRONG.** Second eyes were
   **never unavailable**: every session checked `codex` **on PATH**, but **Codex is a
   GitHub PR review bot on this repo** (`chatgpt-codex-connector[bot]`) and was reachable
   via a PR the whole time. **THE STANDING LESSON, which A-S4 must carry:** *checking one
   delivery channel and concluding a capability is absent is a defeater-class-6 error
   about our own tooling.* **A-S4 SHOULD OBTAIN CODEX REVIEW VIA PR #1 AS A MATTER OF
   COURSE** — it is now a known, working channel, and its first use found two real
   product defects the suite did not.

10. **(NEW AT T-002, CODEX) LG-005 SURFACES AN ALLOWLIST OF POSITIVES AND CAN BLOCK ON
    CODE IT NEVER SHOWED THE MODEL — `src/checks/lg005.ts:205`, a REAL DEFECT ON CLOSED
    A-S2 WORK.** When a webhook **delegates** to a helper that is **idempotent by
    construction** (e.g. a plain state-reconciliation `UPDATE`), the `selects` predicate
    **excludes it**, because it carries none of the event-id / upsert / dedup markers.
    **The model therefore cannot distinguish that safe path from a helper that inserts,
    or sends mail, on EVERY delivery — yet LG-005's verdict can still become a BLOCKER.**
    **Defeater class 6**, and a direct violation of this project's own governing rule:
    **denylist of defeaters, NOT allowlist of positives.** It also **sharpens** the
    standing "`prefers` re-weights, it does not cure" residue. **Independently sourced —
    not a Claude self-review.** **Not fixed at T-002: findings on CLOSED receipts are
    input to a FUTURE packet, never a reopening.** **CORRECTED AT EV-001 — THE SITE IS
    `src/checks/lg005.ts:203` (`selects`), NOT `:205` (`prefers`, a RANKING predicate
    that excludes nothing). Codex's citation is off by two; the defect is real.** qa
    flagged it (DC-13) and the reviewer **independently asserted the opposite** — only
    **direct verification of the source** settled it. **Still unfixed at EV-001: §7.1
    LOCATED and owner-assigned it, and repaired nothing.** **This is now the STAGED
    CANDIDATE for the next packet — see the section above.**
11. **(NEW AT T-002, CODEX) LG-009's `incompleteSurface` IGNORES THE UNBANDED REMAINDER —
    `src/checks/lg009.ts:424`, a REAL DEFECT ON CLOSED A-S3 WORK.** When five preferred
    files fill the cap and an **additional table-name-only candidate holds the real
    isolation logic** (e.g. a relation predicate not spelling a recognized tenant
    column), `incompleteSurface` **ignores the omitted unmatched/trailing band**, so a
    model `fail` is accepted as an **inferred blocker** although **the exonerating query
    was deliberately withheld**. **DC-11 must account for the trailing generic band, or
    PROVE those candidates cannot contain scoping.** This **extends A-S2's "incompleteness
    WITHIN a band" to the UNBANDED REMAINDER** — exactly the asymmetry DC-11 was built to
    guarantee. **Not fixed at T-002.** Same append-only rule. **BAND COUNT ESTABLISHED
    FROM SOURCE AT EV-001, AND IT NARROWS THE HOLE:** `src/scan/surface.ts:174` sizes
    `elidedByBand` as **`bands.length + 1`** (the `+1` is the trailing unbanded slot) and
    `src/checks/lg009.ts:423` sums **only `[0] + [1]`**; **`lg009.ts:412-415` passes
    EXACTLY TWO `prefers` predicates**, so `elidedByBand.length === 3` and `[0]+[1]`
    omits **exactly index 2 — the unbanded remainder, and nothing else.** **"Three
    ordered bands" was a misreading of `elidedByBand`'s LENGTH.** The hole is precisely
    what Codex described — **not wider.** *(Line cite is `:423`, not `:424`.)*
    **The fix packet must still establish this from the code, not from any report.**
    **Still unfixed at EV-001: §7.2 located it only.**

### Carry-forward constraints (unchanged, binding)

Model-layer safety boundary (credential boundary at the bin only; `FakeModelClient`
drives every test; SEC-5 envelope; **SEC-5 trusted-region sanitization** for any
repository-derived text in `question`/`SupportingFact.statement`; cite-or-discard;
at best `inferred`, capped 0.9); **emit-only — engine + schema byte-identical**;
registry is the single source of severity; externalVerification obligation;
**TEST-DATA POLICY — fake provider-key literals on EVERY surface (fixtures, tests,
receipts, memory) keep short suffixes (<20 contiguous alphanumerics) and avoid any
Sentry-DSN shape; never allowlist a secret**; **CEILING INVARIANT — structural**,
and now load-bearing in a second way (it is what made LG-009's pass-branch withdrawal
free); `node_modules` exclusion load-bearing **four ways over**; `PROSE_EXT_RE`
adjudication-gated; AT-23 determinism; **`MODEL_CHECKS` is fixed and APPEND-ONLY**,
sequential, no `Promise.all`; **≤2 commits, Commit-1 green in isolation**; `--amend`
unsafe on this branch (verify `HEAD` first); hold all `build-os/` commits until
close; **per-fixture normalized report hashes publishing BOTH the root token
`<ROOT>` AND the clock `2026-07-23T00:00:00.000Z`** — baseline against the **A-S3**
receipt table, which supersedes A-S2's.

### New carry-forward constraints from T-001

- **THE SELF-UPDATING HOOK.** `.claude/hooks/session-start-build-os.sh:18-31` runs
  `project-bootstrap.sh` on **every SessionStart** with **no `--dry-run`, no
  `--verify`** — a live write, sourced from `/home/user/ClaudeOrchestrator` (hard-coded
  first in `resolve_source()`). On a cache miss it overwrites all 20 managed files
  plus `.claude/settings.json` and the `CLAUDE.md` managed block. qa demonstrated it
  **silently reverting a local `tool_router.md` edit**. **Before ANY `build-os`
  commit in A-S4, run `git status` for managed-path churn** — `git add build-os` or
  `git commit -a` would otherwise sweep it in.
- **MANAGED vs PRESERVED.** 20 files are MANAGED (including **`tool_router.md` and
  `skill_budget.md`**); PRESERVED is **only** `current_state.md`, `residue.md`,
  `packets/active_packet.md`, `receipts/README.md`. **Write project-specific
  knowledge to `current_state.md` / `residue.md`, never to `tool_router.md`.**
- **DO NOT REMOVE `env.BUILD_OS_SPECIALIST_HANDOFF = "1"`** from
  `.claude/settings.json`. It is the gate that keeps `ecc`/`zeroize`-classified
  prompts from writing machine-global config, registering a third-party MCP, and
  spawning an autonomous `claude -p` child.
- **DO NOT INHERIT P-012'S HOST VERDICTS.** The router's capability tables were
  verified on a Mac and are **false on this surface**; `skill_budget.md`'s premise
  does not hold here. **Re-verify per surface.**
- **RECEIPT NAMESPACE.** A-S4 uses the **`A-S*`** detector-fork series. **`T-NNN`** is
  for tooling/runtime packets; **`P-0NN` is frozen** (it collides by filename with
  canonical's own `P-001…P-025`).

### New carry-forward constraints from T-002

- **THE PIN IS APPLIED AND IT FAILS OPEN.** `env.BUILD_OS_SOURCE =
  "/home/user/LaunchGraph"` (`c7baff9`) makes the bootstrap a **TRUE ZERO-WRITE no-op**
  and **survives `--force`** — but it is an **ABSOLUTE PATH**: if the path is gone,
  `resolve_source()` falls through to a ClaudeOrchestrator path and **overwrites
  silently with the key still looking applied**; if the repo is re-checked-out at a NEW
  path while the old one still exists, it **installs into the new checkout FROM the
  abandoned one** — **worse than the original hazard.** **Any packet that moves or
  clones this repo must re-check the pin.**
- **THE HAZARD IS SELF-TRIGGERING.** A local edit to any MANAGED file **alone** flips the
  file-hash half of the cache gate. **Keep running `git status` for managed-path churn
  before any `build-os` commit** — the habit is not superseded by the pin.
- **DO NOT "APPLY THE STAMP".** `~/build-os/.canonical-source` **pins the SOURCE PATH,
  never the SOURCE CONTENT** (`canonical_sha()` reads `git rev-parse HEAD` LIVE). A
  frozen canonical clone **does not close the hazard** either.
- **THE ONLY WORKING UPGRADE FORM** is
  `BUILD_OS_SOURCE=/home/user/ClaudeOrchestrator bash build-os/tools/project-bootstrap.sh --target /home/user/LaunchGraph --force`.
  **`c7baff9`'s commit message says otherwise and is WRONG** (commit messages are
  immutable; the correction lives in the T-002 receipt).
- **THE HOOKS DO NOT FIRE HERE, AND `settings.json` `env` IS NOT DELIVERED ON THIS
  SURFACE (both proven).** **CONSEQUENCE: T-001's `BUILD_OS_SPECIALIST_HANDOFF` gate may
  ALSO be inert.** Both are **dormant because the hooks do not fire — NOT protected.**
  **Do not remove the gate** (it is the only defence wherever `env` IS delivered) and
  **do not treat it as proven.**
- **`tool_router.md` STILL HAS NO ROW FOR FRAMEWORK/TOOLING ADOPTION and IS MANAGED**, so
  a local row is reverted. **NEW: canonical's 3-tier fallback (project → user-scope
  `~/build-os/memory/tool_router.md` → embedded lanes) makes the USER-SCOPE router an
  UNMANAGED, NON-REVERTING home for a `T-` row. `~/build-os` DOES NOT EXIST on this
  host** — creating it is a deliberate act.
- **G1d AND G5 ARE USER ACTIONS, NOT SESSION ACTIONS.** G1d: set the GitHub default
  branch to `main`. G5: delete **three** stale ClaudeOrchestrator branches — **and
  LaunchGraph's same-named `claude/launchgraph-product-scope-43pgdx` is CURRENTLY THAT
  REPO'S DEFAULT; only ever delete the ClaudeOrchestrator one; verify the repo slug.**
- **UPSTREAM DEBT, NEVER FIX HERE:** `project-bootstrap.sh:209` exits the cache path
  before the `CLAUDE.md` and `settings.json` merges, and those two managed outputs are
  **absent from the manifest's `files` map** — a bootstrap can report the runtime up to
  date without repairing drift. **Never write to ClaudeOrchestrator.**
- **PR #1 IS A REVIEW VEHICLE, NOT A MERGE PROPOSAL.** `main` and PR #1 were **explicitly
  authorized** ("Both: create main AND PR now"). **No merge is proposed or authorized.**

---
_Cleared by the archivist on close of **EV-001** (2026-07-28); prior clears on close of
**T-002** (2026-07-27) and **T-001** (2026-07-26). **EV-001's open AND close are both
recorded above** — this file read "Status: NONE ACTIVE" for the whole of that packet and
never named it, and the gap is recorded rather than papered over. **A-S4 is PAUSED BY
USER DIRECTIVE (2026-07-28) — NOT cancelled and NOT superseded — with ALL ELEVEN binding
shaping inputs PRESERVED, NOT CLEARED. The thesis is not abandoned; the build sequence is
adjusted.** **The next packet should be CODE**: the staged candidate is **LG-005
delegated-helper hardening at `src/checks/lg005.ts:203`** — unshaped and unauthorized,
awaiting orchestrator shaping and the user's explicit go. **Detector coverage remains
QUALIFIED — 11 of 15 implemented, 8 offline-decision-moving. The TEST-DATA POLICY remains
in force on every surface. The self-updating bootstrap is self-triggering and the pin
fails open — run `git status` on managed paths before any `build-os` commit.**_
