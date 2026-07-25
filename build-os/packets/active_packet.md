# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** **NONE ACTIVE.**
- **Last closed:** **A-S2** — Phase 1 Repository Auditor — LG-005 (non-idempotent
  webhook processing, Layer D+M) + the D→M surfacing repair (Fork Branch A,
  Slice 2). Closed 2026-07-25. qa **GREEN** (305 passed / 27 files; typecheck
  clean; eval 11 fixtures / 11-of-11 / 0 blocker FPs; Commit-1 isolation at
  `a683916` → 271 / 26, GREEN); reviewer **fix-then-pass, passed as fixed**.
  Commits `a683916` + `30351f1` (amended twice: `043f207` → `30351f1`), plus the
  build-os-only `48e7b66`. Branch tip `48e7b66`, code tip `30351f1`; pushed as a
  fast-forward `93431ed..48e7b66`. **Detector coverage 9 → 10 of 15.** Receipt:
  `build-os/receipts/A-S2.md`.

---

## Staged candidate — A-S3 (NOT active; awaiting orchestrator shaping + explicit go)

- **Id:** **A-S3** (Fork Branch A, Slice 3)
- **Binding constraint from A-S2's §12 and its receipt:** A-S3 **must ship
  LG-009 or LG-011**, with the **`ModelCheck` extraction as its Commit 1** —
  never as its own packet. That gives the seam **three** consumers, including
  LG-007's pure-**M** shape as the next constraint, which is the first point at
  which the interface can be fitted to evidence rather than to LG-006.
- **Binding shaping input #1 — LG-009 is the sharpest remaining risk, and the way
  through is identified.** LG-009 combines all three failure modes found across
  A-S1b / A-S1c / A-S2 **at once**: its spec text ("Absence of evidence fails the
  check — the burden of proof is on the repository") authorizes a **deterministic
  absence verdict → `confirmed` → engine Rule 2 → `not_ready` with no override**,
  not `inferred`; its evidence lives overwhelmingly in `.sql` migrations and
  `.prisma` schemas, exactly what `isModelSurfaceableFile` forbids in a prompt;
  and a capped surface **cannot rank its way out**, because the answering files
  cannot be shown at all. **The asymmetry that resolves it: the SEC-5 bound
  restricts what enters `request.excerpts`, NOT what the deterministic layer may
  read.** `collect()` already reads `.sql`/`.prisma`, and LG-008/LG-015 already
  reason over non-code carriers — so LG-009's Layer D can read migrations
  **directly and completely**, with no cap, no prompt, and no SEC-5 question.
  **A-S3 should exploit this rather than routing LG-009's core signal through the
  model at all, and must NOT ship LG-009's `confirmed` branch before that reading
  is settled.**
- **Binding shaping input #2 — `prefers` is binary; LG-009 will want ≥3 tiers**
  (`ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` ≫ `tenant_id` /
  `organization_id` ≫ generic query code). Not wrong today, but the shape must be
  decided **before** a third consumer fixes it.
- **Also queued for A-S3 Commit 1:** fold the duplicated `elisionDisclosure` and
  `withheldNonSourceDisclosure` helpers (near-identical in `lg005.ts` and
  `lg006.ts`) into `src/scan/surface.ts`.
- **Standing constraints that bind it:** the delegated-surface seam's one
  contract (`selects`/`anchor` stay two parameters; `isModelSurfaceableFile`
  stays distinct from `isCodeFile`; path order preserved within each `prefers`
  band); `PROSE_EXT_RE` is adjudication-gated; `--checks` model-call suppression
  is a security property every new D+M check must honour; model calls stay
  sequential in a fixed check-id order; hash tables publish **both** the root
  token **and** the clock; `--amend` is unsafe on this branch (verify `HEAD`
  first; hold `build-os/` commits until close). See
  `build-os/memory/residue.md`.
- **Open decisions the user still owes:** this repo has **no default branch**
  (third packet flagging it — merge/PR have no target), and **Codex second-eyes
  has been unavailable for four consecutive packets** (now a standing tooling gap
  warranting a decision).

**Not shaped. Not authorized. No builder start until the build-orchestrator
shapes it and the user gives an explicit go.**

---
_Cleared by the archivist on close of **A-S2** (2026-07-25)._
