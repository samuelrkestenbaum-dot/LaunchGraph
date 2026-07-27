# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **T-002** — *Pin the Build OS source; close the long-carried gaps* —
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
- **Detector coverage — UNCHANGED BY T-001 AND UNCHANGED BY T-002, and record it
  QUALIFIED: 11 of 15 implemented, of which 8 can move an offline decision; 3 (LG-005,
  LG-006's M half, LG-009) are online-only or partly so.** Neither T-001 nor T-002
  touched a detector, a test, or a fixture. **"11 of 15" must never stand unqualified.** Tests **387 / 30**; eval
  **11 fixtures / 11-of-11 / 0 blocker FPs**; **FIFTH consecutive
  zero-fixture-movement packet** (`fixtures/` tree
  `a981446bac76039147d93efedd14a092c2aeadc1` — A-S1c, A-S2, A-S3, T-001, T-002);
  **assertion budget 0 spent at A-S3, T-001 AND T-002.**

---

## Next — **A-S4: a staged CANDIDATE awaiting orchestrator shaping + explicit go**

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
    input to a FUTURE packet, never a reopening.**
11. **(NEW AT T-002, CODEX) LG-009's `incompleteSurface` IGNORES THE UNBANDED REMAINDER —
    `src/checks/lg009.ts:424`, a REAL DEFECT ON CLOSED A-S3 WORK.** When five preferred
    files fill the cap and an **additional table-name-only candidate holds the real
    isolation logic** (e.g. a relation predicate not spelling a recognized tenant
    column), `incompleteSurface` **ignores the omitted unmatched/trailing band**, so a
    model `fail` is accepted as an **inferred blocker** although **the exonerating query
    was deliberately withheld**. **DC-11 must account for the trailing generic band, or
    PROVE those candidates cannot contain scoping.** This **extends A-S2's "incompleteness
    WITHIN a band" to the UNBANDED REMAINDER** — exactly the asymmetry DC-11 was built to
    guarantee. **Not fixed at T-002.** Same append-only rule.

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
_Cleared by the archivist on close of **T-002** (2026-07-27); prior clear on close of
**T-001** (2026-07-26). **A-S4 remains a STAGED CANDIDATE ONLY — unshaped and
unauthorized** — awaiting orchestrator shaping and the user's explicit go. Its nine
original binding shaping inputs were carried forward unaltered; **T-002 added inputs 10
and 11 (the two Codex-found defects in LG-005 and LG-009) and discharged the two process
inputs (8, the false no-default-branch premise, and 9, the mis-diagnosed second-eyes
gap). Detector coverage remains QUALIFIED — 11 of 15 implemented, 8 offline-decision-moving.
The TEST-DATA POLICY remains in force on every surface.**_
