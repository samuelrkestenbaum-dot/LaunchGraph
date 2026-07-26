# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **A-S3** — Phase 1 Repository Auditor — the `ModelCheck` seam +
  **LG-009** (missing tenant-isolation evidence, Layer D+M) — **CLOSED 2026-07-26**.
  qa **GREEN**, reviewer **pass**. Commits `406d81b` (C1) + `04a5ea0` (C2, amended
  four times: `6f677d3` → `913e2c5` → `428f113` → `04a5ea0`) on the build-os-only
  shaping commit `0e33643`. Pushed as fast-forward **`0e33643..04a5ea0`**.
  Receipt: **`build-os/receipts/A-S3.md`**.
- **Headline outcome:** **LG-009 shipped with BOTH deterministic branches
  withheld** — no `confirmed` fail, no `confirmed` pass. Detector coverage
  **11 of 15 — qualified: 8 can move an offline decision; 3 (LG-005, LG-006's M
  half, LG-009) are online-only or partly so.** Tests **305/27 → 387/30**; eval
  unchanged at 11 fixtures / 11-of-11 / 0 blocker FPs; zero fixture movement;
  **assertion budget 0 of 5 — the first packet to spend none.**

---

## Next — **A-S4: a staged CANDIDATE awaiting orchestrator shaping + explicit go**

**Not shaped. Not authorized. Do not start.** The orchestrator shapes it; the user
gives the go.

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
7. **Zero-fixture-movement posture** has held for three consecutive packets
   (`fixtures/` tree `a981446bac76039147d93efedd14a092c2aeadc1`). Any A-S4 fixture
   change is a disclosed decision, not a default.
8. **STOP — no default branch, FIFTH packet flagging it.** Merge and PR have no
   target. **This needs a user decision, not a sixth carry-forward.**
9. **Second-eyes is unavailable and is now a STANDING PROCESS RISK** — five
   consecutive packets, and seven LG-009 certification defects found by
   adversarial passes rather than by the suite. The MCP inventory was checked at
   A-S3: none of the connected servers is a code-review tool.

### Carry-forward constraints (unchanged, binding)

Model-layer safety boundary (credential boundary at the bin only; `FakeModelClient`
drives every test; SEC-5 envelope; **SEC-5 trusted-region sanitization** for any
repository-derived text in `question`/`SupportingFact.statement`; cite-or-discard;
at best `inferred`, capped 0.9); **emit-only — engine + schema byte-identical**;
registry is the single source of severity; externalVerification obligation;
TEST-DATA POLICY; **CEILING INVARIANT — structural**, and now load-bearing in a
second way (it is what made LG-009's pass-branch withdrawal free); `node_modules`
exclusion load-bearing **four ways over**; `PROSE_EXT_RE` adjudication-gated;
AT-23 determinism; **`MODEL_CHECKS` is fixed and APPEND-ONLY**, sequential, no
`Promise.all`; **≤2 commits, Commit-1 green in isolation**; `--amend` unsafe on
this branch (verify `HEAD` first); hold all `build-os/` commits until close;
**per-fixture normalized report hashes publishing BOTH the root token `<ROOT>`
AND the clock `2026-07-23T00:00:00.000Z`** — baseline against the **A-S3** receipt
table, which supersedes A-S2's.

---
_Cleared by the archivist on close of **A-S3** (2026-07-26). A-S4 is a staged
candidate only — it awaits orchestrator shaping and the user's explicit go._
