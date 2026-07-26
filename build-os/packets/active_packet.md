# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **T-001** — *Adopt canonical ClaudeOrchestrator Build OS tooling
  into the product repo* — **CLOSED 2026-07-26**. qa **GREEN, 10/10 gates**;
  reviewer **fix-then-pass (recorded as fixed)**. Commit 1 `4920653` (10 files,
  +1290/−2) on base `f6a74c0`; Commit 2 = the reviewer-required activation gate +
  receipt + memory (**committed by the user together with this close**).
  Receipt: **`build-os/receipts/T-001.md`**.
- **Previously closed:** **A-S3** — Phase 1 Repository Auditor — the `ModelCheck`
  seam + **LG-009** (missing tenant-isolation evidence, Layer D+M) — **CLOSED
  2026-07-26**. qa **GREEN**, reviewer **pass**. Commits `406d81b` (C1) + `04a5ea0`
  (C2, amended four times: `6f677d3` → `913e2c5` → `428f113` → `04a5ea0`) on the
  build-os-only shaping commit `0e33643`. Pushed as fast-forward
  **`0e33643..04a5ea0`**. Receipt: **`build-os/receipts/A-S3.md`**.
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
- **Detector coverage — UNCHANGED BY T-001, and record it QUALIFIED: 11 of 15
  implemented, of which 8 can move an offline decision; 3 (LG-005, LG-006's M half,
  LG-009) are online-only or partly so.** T-001 touched no detector, no test, and no
  fixture. **"11 of 15" must never stand unqualified.** Tests **387 / 30**; eval
  **11 fixtures / 11-of-11 / 0 blocker FPs**; **fourth consecutive
  zero-fixture-movement packet** (`fixtures/` tree
  `a981446bac76039147d93efedd14a092c2aeadc1`); **assertion budget 0 spent at both
  A-S3 and T-001.**

---

## Next — **A-S4: a staged CANDIDATE awaiting orchestrator shaping + explicit go**

**Not shaped. Not authorized. Do not start.** The orchestrator shapes it; the user
gives the go. **T-001 did not alter a single one of A-S4's shaping inputs** — the nine
below are carried forward intact.

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
7. **Zero-fixture-movement posture** has now held for **four** consecutive packets
   (`fixtures/` tree `a981446bac76039147d93efedd14a092c2aeadc1` — A-S1c, A-S2, A-S3,
   T-001). Any A-S4 fixture change is a disclosed decision, not a default.
8. **STOP — no default branch, SIXTH packet flagging it, and it is now BLOCKING.**
   Merge and PR have no target — **and as of T-001 that is what blocks
   `mcp__github__request_copilot_review`, the only genuinely independent, non-Claude
   reviewer live on this surface.** **This needs a user decision, not a seventh
   carry-forward.**
9. **Second-eyes is unavailable and is now a STANDING PROCESS RISK** — **five
   consecutive packets** (`codex` absent from PATH; T-001's review was single-model
   analysis plus empirical probes), and seven LG-009 certification defects found by
   adversarial passes rather than by the suite. **T-001, a file-copy packet, neither
   discharged nor worsened this — the count is not reset. A-S4 is where it must be
   answered**, and see input 8: the mitigation exists but is gated on the branch
   decision.

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

---
_Cleared by the archivist on close of **T-001** (2026-07-26). A-S4 remains a staged
candidate only — unshaped and unauthorized — awaiting orchestrator shaping and the
user's explicit go. Its nine binding shaping inputs were carried forward unaltered._
