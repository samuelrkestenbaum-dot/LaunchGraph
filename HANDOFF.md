# SugarBee.ai — Project Handoff

> For a new Claude session picking this up cold. Read this, then read the
> living state in the control repo (§5) before doing anything.

## 0. First move (do this before acting)

The **source of truth is the Build OS memory**, not this file. On session start, read, in order:
1. `ClaudeOrchestrator/build-os/memory/current_state.md` — where we are.
2. `ClaudeOrchestrator/build-os/memory/residue.md` — standing constraints + open follow-ups.
3. `ClaudeOrchestrator/build-os/packets/active_packet.md` — the next staged packet.
4. The latest `ClaudeOrchestrator/build-os/receipts/P-*.md` — what the last packet did.
5. `LaunchGraph/specs/phase-1-repository-auditor.md` — the authoritative spec.

This handoff summarizes them but they are canonical and kept current.

## 1. What SugarBee.ai is

A production-readiness auditor for AI-built SaaS. The long-term product is a
"launch operator," but the **shipping wedge (Phase 1)** is narrow and read-only:
it statically scans a TypeScript/Next.js repo and reports the consequential
conditions that would block a safe production launch — 15 checks, evidence-backed,
with a `Ready / Ready with warnings / Not ready` decision.

Phase 1 is **structurally read-only**: never executes the scanned repo, reads no
provider credentials, instantiates no provider SDKs; the *only* permitted network
egress is a configured model API. Full product vision: `PRODUCT_SCOPE.md`.

## 2. Repos, branch, how to run

| | |
|---|---|
| **Product repo** | GitHub `samuelrkestenbaum-dot/LaunchGraph` (slug still says LaunchGraph — see §9), local `/home/user/LaunchGraph`, tip **`b9c8ff5`** |
| **Control repo (Build OS)** | `samuelrkestenbaum-dot/ClaudeOrchestrator`, local `/home/user/ClaudeOrchestrator`, tip **`ef8a75c`**; Build OS lives in `build-os/` |
| **Working branch (BOTH repos)** | `claude/launchgraph-product-scope-43pgdx` — **pinned, do not rename** |
| **Run** | `npm test` (Vitest) · `npm run typecheck` (tsc --noEmit) · `npm run eval` (fixture harness) |
| **CLI** | `sugarbee scan [path]` / `sugarbee eval`; via `npx tsx bin/sugarbee.ts …` |

Zero runtime dependencies. Dev deps: typescript, vitest, @types/node, tsx.

## 3. Current state (as of the last packet, P-005)

- **213 tests / 24 files green**, typecheck clean, `eval` 10/10 decisions, 0 blocker false positives.
- **9 of 15 checks implemented and CLI-wired:**

| Done (9) | Layer | Remaining (6) | Layer | Notes |
|---|---|---|---|---|
| LG-001 localhost callbacks | D | LG-005 non-idempotent webhook | D+M | next up (A-S2) |
| LG-002 Stripe key mixing | D | LG-007 payment→entitlement | M | |
| LG-003 missing prod webhook | D (ext) | LG-009 tenant isolation | D+M | |
| LG-004 webhook sig verify | D | LG-011 email links hostname | D+M | |
| LG-006 cancellation handling | **D+M** | LG-013 conversion event | D+M | warning |
| LG-008 preview→prod DB | D | LG-012 password recovery | D+M (ext) | **last** (A-S7) |
| LG-010 email domain auth | D (warn) | | | all 6 need the model layer |
| LG-014 Sentry unverified | D (warn) | | | |
| LG-015 prod domain | D (ext) | | | |

- The **deterministic-only run is complete**; all 6 remaining checks require the model layer, which now exists.
- **CLI**: exit codes `0` ready/ready_with_warnings · `1` not_ready · `2` scan/parse error · `3` not_evaluated (unsupported stack). Flags `--json` (canonical JSON to stdout, no files), `--out`, `--offline`, `--checks`, `--app`. Default writes `report.json` + `report.md` confined to `.sugarbee/` (or `--out`).

## 4. Architecture (the seams to reuse, never re-implement)

- `src/schema/index.ts` — the `Report`/`Finding`/`Evidence` types + `validateReport` (enforces `inferred` ≤ 0.9, `confirmed` == 1.0). **The Evidence/Finding shape is the "evidence bus."**
- `src/checks/registry.ts` — the single source of check metadata (id/title/severity/layer/external). Detectors draw metadata via `src/checks/detectorKit.ts` (`makeFinding`, `makeExternalVerification`) — never hardcode.
- `src/scan/collect.ts` — SEC-6 containment traversal (symlink-escape reject, size/count caps, binary skip). `src/scan/redact.ts` — SEC-4 redaction + `buildEvidence`/`buildAbsenceEvidence`, the **sole** evidence path.
- `src/scan/scanner.ts` — `createScanner(opts)(dir) => Report` (sync, deterministic) composes detectors → `decide()`. `scanWithModel(dir, model)` is the async online path.
- `src/decision/engine.ts` — pure `decide()`; Rules: unsupported→not_evaluated; confirmed blocker→not_ready; inferred blocker <0.7→requires_confirmation (Rule 4); contradictory→requires_confirmation (Rule 5); warnings/unknowns/pending-external→ready_with_warnings (Rule 6). **Do not change it** — checks only *emit* the right classification/confidence.
- `src/model/` — the model-layer substrate (see §6): `client.ts` (`ModelClient` interface + `buildUntrustedDataEnvelope`), `fakeClient.ts` (drives ALL tests), `realClient.ts` (bin-only, built-in `fetch`, no SDK), `inference.ts` (pure D→M contract: cite-or-discard, cap 0.9, inferred/contradictory).
- `src/cli/` + `bin/sugarbee.ts` — `run(argv, io): number`, pure/sync, all writes via injected `Io`. The bin constructs the real model client from `SUGARBEE_MODEL_*` env (the credential boundary).
- `src/eval/harness.ts` — `runEvaluation` over `fixtures/`. `src/report/serialize.ts` — canonical (byte-deterministic) JSON.
- Fixtures: `fixtures/broken-lg-00{1,2,3,4,8,10,14,15}/`, `clean-min/`, `unsupported/` — all inert (`private:true`, no scripts, excluded from tooling).

## 5. How work is done here — the Build OS protocol (IMPORTANT)

This repo runs a disciplined multi-agent loop. **Every substantive change goes through it.** Use the subagents (Agent tool), not ad-hoc edits:

1. **build-orchestrator** — routes/shapes/decomposes; NEVER implements. Verifies branch base, declares a Tool Budget, splits into ≤2-commit packets. Invoke first on "what's next / keep going / architecture."
2. **builder** — implements one confirmed packet, test-first, **≤2 commits**, **Commit-1 green in isolation**, no external mutation.
3. **qa** — independent full-suite re-derivation + Commit-1 isolation (fresh worktree) + safety grep. Reports exact counts. RED blocks close.
4. **reviewer** — one verdict: pass / fix-then-pass / fail. Adversarial, spec-fidelity focused. No edits.
5. **archivist** — writes `build-os/receipts/<id>.md` and updates `build-os/memory/`. Touches `build-os/` only.

The main session drives: orchestrator → builder → qa + reviewer (parallel) → (fix loop if needed) → **push** → archivist. Then commit + push the receipt.

## 6. Hard rules / standing constraints (do not violate)

- **No merge, no PR without explicit user go.** These are hard stops.
- **Push** to the working branch is under *standing authorization* — but only **after qa is green + reviewer passes + a two-repo scanner-safety grep**. Push is a fast-forward.
- **Model-layer safety boundary**: `RealModelClient` is imported only by the bin, uses built-in `fetch` (no SDK, zero runtime deps), reads no `process.env`. `FakeModelClient` drives ALL tests — **no real API call or credential in build/test, ever**. Model gets only deterministic-surfaced, already-redacted excerpts wrapped as SEC-5 delimited untrusted data; no tools; cite-or-discard; classified at best `inferred`, capped 0.9. **Engine + schema stay byte-identical (emit-only).**
- **externalVerification obligation**: any finding for an external check (LG-003/010/012/014/015) must carry `externalVerification` (or `unverified`) and NEVER represent repo evidence as provider-side proof. LG-012 is the last pending one. Phase-1 decision ceiling is `ready_with_warnings` (never unqualified `ready`).
- **CEILING WATCH-ITEM**: preserve the invariant `hasAppSignal ⊇ scanner.supported` (LG-015's gate is a superset of the scanner's supported predicate). Don't broaden `detectStack`/`supported` or narrow LG-015's gate without preserving it, or an unqualified-`ready` hole opens. Add an AT-16 regression when a real `golden/` fixture lands.
- **TEST-DATA POLICY**: every key-shaped fake (fixtures/tests/docs/receipts/memory) uses a **short suffix (<20 contiguous alphanumerics)** and **no Sentry-DSN shapes**. GitHub push-protection is on; never resolve a blocked push by allowlisting a secret — reshape the test data. This applies to receipts/memory too (documenting a real key literal re-trips the scanner).
- **Commit hygiene**: committer/author `noreply@anthropic.com`; end every commit body with the `Co-Authored-By: Claude Fable 5` + `Claude-Session:` trailer. Never put the model identifier in commits/PRs/code.
- **GitHub access** is via the `mcp__github__*` MCP tools (load via ToolSearch) — there is no `gh` CLI in this environment.

## 7. The exact next step

**A-S2 is staged (candidate, awaiting orchestrator shaping + explicit go)** in `active_packet.md`. The recommendation is to land a **bundle** first, because the pieces are one natural unit and A-S2 needs the locator anyway:

1. **Extract the shared webhook-handler locator** — it's currently restated byte-identically in `lg004.ts` and `lg006.ts`; LG-005 would be a third consumer. Extract to a shared module with a guard test asserting the locators agree. Reconcile `.find()` (LG-006, first-handler-only) vs `.filter()` (LG-004, all-handlers).
2. **Fix the LG-006 deterministic-disjunct fidelity gap (TOP follow-up)** — a *fully missing* cancellation branch is a **deterministic `confirmed` blocker** per spec §3/§4.3 and must stand under `--offline`. Today it reports `unknown`/`inferred` — a false-negative on the canonical LG-006 defect in the CI path. Reserve `unknown`/`inferred` for the branch-present-but-downgrade-unconfirmed case.
3. **Add `broken-lg-006` fixture + AT-06-via-eval**, sequenced with #2.

Then implement **LG-005** (non-idempotent webhook, D+M) via the substrate: a Layer-D surface fn (using the shared locator) + an `InferencePresentation` through `runInferenceContract`.

**Roadmap after A-S2:** LG-009, LG-011, LG-013 (D+M) → LG-007 (M) → **LG-012 (D+M, external — last)**. Then the deferred program items in §8.

## 7A. PENDING (user-authorized, NOT yet done): adopt the canonical Build OS tooling

The user authorized "update this project to the latest canonical ClaudeOrchestrator at `7ef50e8` and make future fresh Code tasks pick it up," then changed course to hand off. **Investigated read-only, nothing executed.** Findings for whoever resumes it:

- **`7ef50e8`** is the tip of ClaudeOrchestrator's **canonical default branch `claude/add-build-os`** (dated 2026-07-25, author "Sam's Mac"). The framework has advanced ~17 packets past our base (P-006…P-022): a **SessionStart bootstrap**, MCP auto-registration (Serena/Repomix/ccusage), claude-watch supervision, terminal-integrity, `build-os/tools/*.sh`, `install-accelerators.sh`, `repair-host-integrations.sh`, `templates/`, `tests/build_os_tests.sh`.
- **The "fresh Code tasks pick it up" mechanism** is canonical `.claude/settings.json` → `hooks.SessionStart` → `.claude/hooks/session-start-build-os.sh` (+ `UserPromptSubmit` → `prompt-router.sh`). That hook prints the orchestrator reminder, background-runs `install-accelerators.sh`, and surfaces the active packet + a capability inventory. Adopting canonical `.claude/` + the scripts is what makes new sessions auto-load Build OS.
- **Our branch never touched the framework files** (`.claude/`, CLAUDE.md, scripts) — we only ever wrote `build-os/{memory,packets,receipts}`. So framework files can be taken from `7ef50e8` cleanly.
- **CRITICAL collision caveat:** a naive `git merge 7ef50e8` will CONFLICT, because canonical's `build-os/receipts/P-001…P-022.md` and `build-os/memory/*` are **framework-development** packets, while OUR `P-001…P-005.md` + memory are **SugarBee product** packets — same filenames, different content. Do NOT merge blindly. The right move is a **selective adoption**: check out the framework paths from `7ef50e8` (`.claude/`, `.mcp.json`, `.gitignore`, `build-os/tools/`, `build-os/memory/tool_router.md`, `build-os/receipts/README.md`, all top-level `*.sh`, `templates/`, `tests/`, `CLAUDE.md`, `INSTALL.md`, `INTEGRATIONS.md`, `README.md`) while **preserving** our SugarBee project state (`build-os/memory/current_state.md`, `residue.md`, `build-os/packets/active_packet.md`, `build-os/receipts/P-001…P-005.md`). Then verify the SessionStart hook fires and commit/push. Consider whether the SugarBee project memory should instead live in the **product** repo (canonical flow installs Build OS *into* a project via `connect-project.sh`/`install-project.sh`) — worth confirming with the user.

## 8. Open follow-ups / deferred (from residue.md)

- **Deferred fixtures/ATs**: real `golden/` (AT-16, + the ceiling regression), `hostile/` (AT-18/20/21/22), `broken-lg-006` and the model-layer broken fixtures; eval-harness model wiring.
- **SEC-5 hardening**: `buildUntrustedDataEnvelope` doesn't yet neutralize an excerpt that reproduces the END delimiter token — harden alongside the hostile fixture.
- **Remediation packages (§8 of spec)**: not built yet (no machinery); Claude/Codex work-package format is specified but unimplemented.
- **Smaller**: spec header still says "not yet implemented" (stale); `report.repo.commit` is null (reading `.git/HEAD` deferred); cosmetic banner locator artifact when scanning a fixture dir; LG-008 optional warning for a lone committed DB URL; LG-003 provider-agnostic webhook presence; LG-010 no-PSL domain heuristic; LG-014 implicit-Sentry mechanisms.
- **Gravito** (the user's other project — a Vite/Express/Fly.io SaaS, NOT Next.js): recorded as the **first named post-golden-path recipe + real-world eval target**; the golden Next.js path is completed first, so it's not built yet. Separately, a Gravito **governance visibility item** is tracked (a live substrate-readiness check reports Claude/Manus/surplus_recovery as missing surfaces) — non-blocking, outside Build OS scope.

## 9. Naming & gotchas

- The product was **renamed LaunchGraph → SugarBee.ai** (brand) and `launchgraph → sugarbee` (CLI/package/`.sugarbee/` dir/`SUGARBEE_*` env/`bin/sugarbee.ts`).
- **Check IDs kept the `LG-` prefix** (spec-declared "stable, versioned"; opaque IDs, not brand). Could be moved to `SB-` if the user wants — it's ~414 occurrences across code/tests/fixtures/receipts, a deliberate non-change.
- The **GitHub repo slug is still `LaunchGraph`** and the **branch is still `claude/launchgraph-product-scope-43pgdx`** — neither is renamable from a session (repo slug = GitHub settings; branch is pinned by session instructions). Their contents say SugarBee.ai.
- **Closed receipts P-001…P-005 still say "LaunchGraph"** — preserved as append-only history per the receipts convention.
- Everything is **pushed and in sync**; nothing merged; no PR open.
