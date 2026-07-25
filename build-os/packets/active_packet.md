# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **A-S1c** — Phase 1 Repository Auditor — **the D→M surfacing
  contract**: repo-scoped excerpt surfacing + deterministic-layer-first ordering
  + honest contradiction handling — Fork Branch A, Slice 1c. Closed
  **2026-07-25**. Receipt: `build-os/receipts/A-S1c.md`.
  - qa **GREEN** — `npm test` **253 passed / 25 files** (base `e8f6f99` was
    233/25); typecheck clean; `npm run eval` **11 fixtures / 11-of-11 decisions /
    0 blocker false positives**. Commit-1 isolation at `f3a981f` **GREEN**
    (236/25 in a fresh `npm ci` worktree, typecheck clean, eval 11/11). Engine
    blob `54b0990…` + schema blob `c1ae295…` unchanged (emit-only preserved).
    **Zero fixture movement** — `fixtures/` tree object
    `a981446bac76039147d93efedd14a092c2aeadc1` identical at both ends.
    **Assertion budget: exactly 1 for the whole packet**, ZERO in Commit 2.
    Safety grep clean.
  - reviewer **PASS**, after two must-fix-before-close items were fixed in-packet
    via amend (the `isCodeFile` docstring overclaim; the elision disclosure moved
    into `request.question` because `Evidence.note` is not transmitted by
    `buildUntrustedDataEnvelope`).
  - Commits `f3a981f` (Commit 1) and `7908d5d` (Commit 2, amended twice —
    `f41beae` then `7908d5d`; **Commit 1 unchanged throughout**). Pushed as a
    normal fast-forward **`e8f6f99..7908d5d`**. Branch tip `7908d5d`.
  - **Cost stated honestly: detector coverage is STILL 9 of 15 — a second
    consecutive packet with no new detector.** Correct both times (the D→M
    contract had to be right before the four remaining D+M checks inherit it),
    but a third such packet needs a real argument.

---

## Staged candidate — NOT active, awaiting orchestrator shaping + explicit go

- **Candidate id:** **A-S2**
- **Candidate title:** Phase 1 Repository Auditor — **LG-005 (non-idempotent
  webhook handler, Layer D+M)** — Fork Branch A, Slice 2.
- **Status:** candidate only. **No authority to build.** Needs orchestrator
  shaping into a ≤2-commit packet with an assertion-change budget, then an
  **explicit go** from the user.
- **Seams it inherits:** the shared webhook locator `src/scan/webhook.ts`
  (A-S1b — LG-005 is its intended third consumer) and the D→M surfacing contract
  (A-S1c).

### ARCHIVIST'S STANDING WARNING — carried forward, in corrected form

**A-S2 must NOT assume the D→M contract is fully settled.** A-S1c made it honest;
it did not make it finished. Three residue items bear directly on A-S2:

1. **LG-005 WILL HIT THE IDENTICAL FALSE-FACT TRAP** if it attaches a
   `establishesVerdict: 'fail'` fact gated on `isCodeFile`. `isCodeFile` is
   `/\.(?:ts|tsx|js|jsx|mjs|cjs)$/` — **no `mts`/`cts`**. A repo whose
   idempotency guard is a **unique constraint in a `.sql` migration or a
   `.prisma` schema** — or whose dedup logic lives in a `.mts`/`.cts` module — is
   **the same trap on a second blocker-capable check**: the D layer attaches a
   false fail-establishing fact *and* withholds the file that would disprove it,
   and the likely model-agreement branch yields **`not_ready` on a correct
   repository**. See residue TOP ITEM. **Frame it as a false fact about correct
   repos, not as "the extension list needs widening."**
2. **Extract the surfacing helper BEFORE the second copy exists.** The
   repo-wide-grep + cap + window logic is **inline in `lg006.ts`**, and LG-005's
   signal (`event.id` dedup) is a **far more common string** than a cancellation
   event name — a naive grep surfaces noisier files and hits the 5-file cap far
   more often. Target:
   `surfaceDelegatedCandidates(fileset, { handlers, signalRe, cap, window })`.
3. **`scanWithModel` hardcodes the LG-006 `surface → isSettled → interpret`
   triple.** Five more D+M checks means five more inline triples; a small
   `ModelCheck` interface is the next seam.

Also binding on A-S2: the **5-file cap makes no completeness argument** (its
original justification was demolished — six mentions can all be UI copy); the
**elision honesty guard is a regression pin, not a semantic guarantee**;
`node_modules` exclusion is **load-bearing twice over** (blocker + prompt
surface); regression baselines are **per-fixture normalized hashes, never a
whole-corpus aggregate**; and **no Codex second-eyes pass is available** in this
environment.

---

## Standing gates (unchanged)

- **NO merge to any default branch and NO pull request** — both await explicit
  go, and **this repo still has no default branch** (no `main`/`master`, local or
  remote), so "never merge without go" currently has no target and a PR has
  nowhere to land. **Needs a user decision.**
- No deploys, no secrets touched or allowlisted, no provider access, **no real
  model API call** — `FakeModelClient` drives every test.
- **TEST-DATA POLICY** applies to every surface including packets, receipts, and
  memory.

---
_Cleared by the archivist on close of **A-S1c** (2026-07-25). The full A-S1c
contract as shaped is preserved in `build-os/receipts/A-S1c.md` and in git
history at `e8f6f99..7908d5d`._
