# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **A-S1b** — Phase 1 Repository Auditor — shared webhook
  locator + LG-006 deterministic-disjunct fidelity fix + `broken-lg-006` fixture
  (AT-06 via eval) — Fork Branch A, Slice 1b. Closed **2026-07-25**.
  Receipt: `build-os/receipts/A-S1b.md`.
  - qa **GREEN** — `npm test` **233 passed / 25 files** (base `ed71d6e` was
    213/24); typecheck clean; `npm run eval` **11 fixtures, 11/11 decisions,
    0 blocker false positives**. Commit-1 isolation at `7683d74` **GREEN**
    (223/25 in a fresh `npm ci` worktree). Engine + schema blob SHAs unchanged
    (emit-only preserved). Safety grep clean.
  - reviewer **PASS as fixed**, after one fix-then-pass round that removed a
    false blocker on a *correct delegating* handler.
  - Commits `7683d74` (Commit 1) and `6509b35` (Commit 2, amended from
    `6fa0060`); pushed as a fast-forward **`ed71d6e..6509b35`**. Branch tip
    `6509b35`.

---

## Staged candidate — NOT active, awaiting orchestrator shaping + explicit go

- **Candidate id:** **A-S2**
- **Candidate title:** Phase 1 Repository Auditor — **LG-005 (non-idempotent
  webhook, Layer D+M)** — Fork Branch A, Slice 2
- **Why it is next:** LG-005 is the next detector on Branch A, and A-S1b handed
  it **the shared webhook-locator seam it needed** (`src/scan/webhook.ts`,
  all-handlers `.filter()` contract, deterministic via `collect.ts:270`'s path
  sort). LG-005 is its intended third consumer.

### OPEN QUESTION THE ORCHESTRATOR MUST DECIDE BEFORE SHAPING A-S2

**Does the D→M surfacing contract change land BEFORE A-S2, or WITH it?**

Residue items — the TOP ITEM (LG-006 deterministic-disjunct fidelity gap, **half
closed**: the offline/CI path is closed, **the online path still substitutes
model judgment for a required deterministic signal, spec §4.3**) and the
companion item (**the "never manufacture a false blocker" guarantee is
OFFLINE-ONLY** — `request.excerpts` carries only handler files, and
`lg006.ts:240` still gates the fail-establishing supporting fact on the narrow
handler-file signal) — share **one root cause and one fix surface: what the
deterministic layer surfaces to the model.**

**LG-005 will need that same contract change.** So A-S2 must either (a) be
sequenced behind a shaped D→M-contract packet, or (b) absorb it explicitly in
its own scope with a widened assertion budget. **Do not let A-S2 be shaped on the
assumption that the contract is already settled.** Note also that the deferred
fix is a genuine design question, not a mechanical edit: it makes
`fact:lg006.no-cancellation-branch` dead code and costs LG-006 its only
contradiction-guard test, with no branch-present deterministic fact to replace
it.

### Carry into whatever gets shaped next

- **Standing constraints** (see `build-os/memory/residue.md`): TEST-DATA POLICY;
  MODEL-LAYER SAFETY BOUNDARY (credential boundary at `bin/sugarbee.ts` only);
  EMIT-ONLY engine + schema (blob SHAs unchanged); registry is the single source
  of severity/blocker/provider; externalVerification obligation (LG-012 is the
  last pending external check, A-S7); CEILING INVARIANT
  `hasAppSignal ⊇ scanner.supported`; AT-23 determinism; **`node_modules`
  exclusion is load-bearing**; **the shared webhook locator is one contract** —
  import it, do not restate the predicate (`lg003.ts:51` is still an unmigrated
  third copy).
- **Working contract:** verify the branch base with `git merge-base` at builder
  start; ≤2 commits; Commit-1 green in isolation; full proof + safety grep before
  close.
- **Standing flag, not this packet's work:** **this repo has no default branch** —
  no `main`/`master` locally or on the remote, only the two `claude/*` branches.
  `git merge-base HEAD origin/main` fails. "Never merge without go" currently has
  no target and an eventual PR has nowhere to land. Needs a user decision at some
  point.
- **Process note:** **no Codex second-eyes pass is available in this environment**
  (`codex` not on PATH, no plugin). Review is single-model analysis plus
  empirical probes — do not overstate the proof standard in future receipts.

---
_Cleared by the archivist on close of A-S1b (2026-07-25). A-S2 (LG-005) is staged
as a candidate only — it is NOT active and requires orchestrator shaping plus the
user's explicit go before any builder work begins._
