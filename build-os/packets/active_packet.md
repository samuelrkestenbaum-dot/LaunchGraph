# Active Packet

> The one packet currently in flight. The orchestrator reads this every session;
> the builder implements exactly this and nothing else; the archivist clears it
> on close. One packet at a time.

- **Status:** none active (last closed: **P-005** — see `build-os/receipts/P-005.md`).

---

## Staged candidate (awaiting orchestrator shaping + explicit go)

- **Status:** candidate — awaiting orchestrator shaping + explicit go. NOT activated.
- **Working id:** A-S2 (Fork Branch A, Slice 2)
- **Nominal title:** Phase 1 Repository Auditor — LG-005 (non-idempotent webhook, Layer D+M) via the model-layer substrate.

### Recommendation for the orchestrator to shape (IMPORTANT)

Before or WITH LG-005, the next slice should first land a bundle — these three are naturally one unit and A-S2 needs the locator anyway:

1. **Extract the shared webhook-handler locator** (currently restated byte-identically in `lg004.ts` + `lg006.ts`) into a shared module (e.g. `src/scan/webhook.ts` or `detectorKit`), with a guard test asserting the locators agree. LG-005 will be a THIRD consumer, so do this before it lands. Reconcile the `.find()` (LG-006, first-handler-only) vs `.filter()` (LG-004, all-handlers) multi-handler behavior here. (Residue follow-up #2.)
2. **Fix the LG-006 deterministic-disjunct fidelity gap** — a FULLY MISSING cancellation branch must emit a deterministic `confirmed` blocker `fail` that stands even under `--offline` (today it reports `unknown`/`inferred` — a false-negative on the canonical LG-006 defect in the deterministic/CI path). Reserve `unknown`/`inferred` for the branch-present-but-unconfirmed case. This is a FIDELITY gap, not a safety gap (the deterministic signal is already captured). (Residue TOP ITEM / follow-up #1.)
3. **Add the `broken-lg-006` eval fixture** and AT-06-via-eval, sequenced with #2.

The orchestrator must decide whether this bundle is its own slice (A-S1b) or folds into A-S2, and decompose to ≤2 commits at go time.

### Likely goal / "done" (LG-005 portion)

- Implement LG-005 (non-idempotent webhook handler) as a Layer D+M check plugged into the existing substrate: a Layer-D surface fn (using the SHARED webhook locator from item 1) + an `InferencePresentation`, run through `runInferenceContract`. Model receives only deterministic-surfaced, already-redacted excerpts wrapped as SEC-5 untrusted data; no tools; cite-or-discard; classified at best `inferred`, capped 0.9, `contradictory` on disagreement; `--offline` → `unknown` ("model layer disabled"). Engine + schema UNCHANGED (emit-only). Full suite green; Commit-1 green in isolation; eval stays 10/10 / 0 blocker FPs.

### Branch base

- origin/`claude/sugarbee-project-handoff-ic47uc` @ **a00d194** (the P-005 tip `fb5663b` plus the brand rename `b9c8ff5` and the handoff doc `a00d194`; the retired `claude/launchgraph-product-scope-43pgdx` points at the identical commit). Re-verify via `git merge-base` at builder start.

### Carry-forward constraints (bind this slice)

- **Model-layer safety boundary** — credential boundary at the bin only; `RealModelClient` bin-only over built-in `fetch`, no `process.env` in model/detector code; `FakeModelClient` drives ALL tests; SEC-5 delimited untrusted data; emit-only (engine + schema byte-identical).
- **externalVerification obligation** — LG-012 is the LAST pending external check (A-S7); the substrate threads it via `InferencePresentation.externalVerification`.
- **TEST-DATA POLICY** — <20 contiguous alphanumerics for every key-shaped fake; no Sentry-DSN shapes; every surface incl. receipts/memory; never allowlist a secret.
- **CEILING WATCH-ITEM** — `hasAppSignal ⊇ scanner.supported`; add the AT-16 regression when `golden/` lands.
- **The model-layer substrate seam** — `ModelClient`/`InferenceRequest`/`InferenceResult`/`runInferenceContract`/`InferencePresentation` is the plug-in point; A-S2 supplies a Layer-D surface fn + a presentation.
- **Registry is the single source** of check metadata (severity/blocker/provider via `makeFinding`).

---
_Cleared by the archivist on close of P-005 (2026-07-23). No packet is active until
the orchestrator shapes the next slice and the user gives explicit go. Merge and PR
remain hard stops; no deploy, no secrets, no provider access._
