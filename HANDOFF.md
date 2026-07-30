# SugarBee.ai — Project Handoff

For a fresh Claude Code session picking this up cold. Read this, then read the
living state in §1 before doing anything. **Written 2026-07-26, at the close of
packet A-S3.**

---

## 0. Everything is pushed. Start here.

Both repos are clean and in sync with GitHub. Nothing is owed to git.

| | |
|---|---|
| **Product repo** | `samuelrkestenbaum-dot/LaunchGraph` (slug still says LaunchGraph — see §9), local `/home/user/LaunchGraph`, tip **`6deab47`** |
| **Working branch** | `claude/sugarbee-project-handoff-ic47uc` — all four packets of work are here |
| **Framework repo** | `samuelrkestenbaum-dot/ClaudeOrchestrator` — **tools only, do not write to it** (see §5) |
| **Run** | `npm test` · `npm run typecheck` · `npm run eval` |
| **CLI** | `npx tsx bin/sugarbee.ts scan [path]` / `eval` |

Zero runtime dependencies. Dev deps: typescript, vitest, @types/node, tsx.
`npm install` first — `node_modules` is not committed.

---

## 1. First move — the living state, not this file

**This file summarizes; `build-os/` is authoritative and is kept current.** Read,
in order, all in THIS repo:

1. `build-os/memory/current_state.md` — where we are.
2. `build-os/memory/residue.md` — **read the TOP ITEM and the Standing constraints.**
3. `build-os/packets/active_packet.md` — A-S4 staged, with binding shaping inputs.
4. `build-os/receipts/A-S3.md`, then `A-S2.md` — what the last two packets did and
   deliberately did *not* do.
5. `specs/phase-1-repository-auditor.md` — the authoritative spec.

---

## 2. What SugarBee.ai is

A production-readiness auditor for AI-built SaaS. The shipping wedge (**Phase 1**)
is narrow and structurally read-only: it statically scans a TypeScript/Next.js
repo and reports the consequential conditions that would block a safe production
launch — 15 checks, evidence-backed, producing **Ready / Ready with warnings /
Not ready**.

Phase 1 never executes the scanned repo, reads no provider credentials, and
instantiates no provider SDKs. The only permitted network egress is SugarBee's
own model API. Full vision: `PRODUCT_SCOPE.md`.

**The Phase-1 decision ceiling is `ready_with_warnings`** and it is *structural*,
not incidental: `scanner.supported`'s disjuncts are a strict subset of LG-015's
`hasAppSignal`, so LG-015 always attaches a pending external verification on a
supported stack, so engine Rule 6 always pre-empts Rule 7. Unqualified `ready` is
unreachable. Do not break that subset relation.

---

## 3. Current state — A-S3 closed

| | |
|---|---|
| Suite | **387 tests / 30 files**, typecheck clean |
| Eval | **11 fixtures / 11-of-11 decisions / 0 blocker false positives** |
| Detectors | **11 of 15 — see the qualification below, it matters** |
| Code tip | `04a5ea0`; branch tip `6deab47` (the A-S3 close commit) |

**Detector coverage must be stated qualified: 11 of 15 implemented, of which 8 can
move an offline decision.** LG-005, LG-006's model half, and LG-009 are online-only
or partly so. LG-009's contribution to the 11/11 eval result is **exactly zero**,
and none of this advances §9.3's 15/15-recall or 18/18-decision thresholds. "11 of
15" unqualified overstates progress toward a program gate none of these packets
touched.

**Done:** LG-001/002/003/004/005/006/008/009/010/014/015.
**Remaining:** **LG-007, LG-011, LG-012, LG-013.**

**Exit codes:** `ready`/`ready_with_warnings` → 0 · `not_ready` → 1 · scan/parse
error → 2 · `not_evaluated` (unsupported stack) → 3.
**Flags:** `--json`, `--out`, `--offline`, `--checks`, `--app`. Default writes
`report.json` + `report.md` confined to `.sugarbee/` (or `--out`).

---

## 4. Architecture — the seams to reuse, never re-implement

- `src/schema/index.ts` — Report/Finding/Evidence + `validateReport` (enforces
  inferred ≤ 0.9, confirmed == 1.0). **Byte-frozen: `c1ae295…`.**
- `src/decision/engine.ts` — pure `decide()`; Rules 1–7. **Byte-frozen:
  `54b0990…`.** The model layer is **emit-only**: checks emit the right
  classification/confidence and the engine does the rest. If a change appears to
  need an engine or schema edit, that is a stop, not an expansion.
- `src/checks/registry.ts` — single source of check metadata. Detectors draw
  severity/blocker/provider via `src/checks/detectorKit.ts` (`makeFinding`).
  **Never hardcode `blocker`.**
- `src/scan/collect.ts` — SEC-6 containment traversal. **No extension filter** —
  every readable text file including `.sql`/`.prisma` is in `fileset.files`.
  Sorted by path at `:270` (AT-23 determinism rests on this). `IGNORED_DIRS`
  excludes `node_modules` and that exclusion is **load-bearing four ways over**.
- `src/scan/redact.ts` — SEC-4 redaction + `buildEvidence`/`buildAbsenceEvidence`,
  the sole evidence path.
- `src/scan/webhook.ts` — the single webhook-handler locator, **all-handlers
  (`.filter()`) semantics**. Every consumer imports it. (`lg003.ts:51` still holds
  an un-migrated copy — residue.)
- `src/scan/surface.ts` — **the D→M surfacing seam.**
  `surfaceDelegatedCandidates(fileset, opts)` with `selects` and `anchor` as **two
  distinct parameters** (see §7), ordered `prefers` bands, `elidedByBand`, plus
  `isModelSurfaceableFile` (= `isCodeFile` ∪ `{.mts,.cts}`), `isProseFile`, and the
  two disclosure helpers.
- `src/model/modelCheck.ts` — **the `ModelCheck` seam.** Settledness is expressed
  as **the absence of a request** (`request: undefined`), not an `isSettled`
  boolean — because a boolean's plausible default (`() => false`) would ship an
  `infer` call, i.e. repository text leaving the process, for a check that had
  already decided. `MODEL_CHECKS` = `['LG-006','LG-005','LG-009']`, **fixed,
  append-only, sequential, no `Promise.all`.**
- `src/model/` — `client.ts` (`ModelClient` + `buildUntrustedDataEnvelope`),
  `fakeClient.ts` (**drives ALL tests**), `realClient.ts` (**bin-only**, built-in
  `fetch`, no SDK), `inference.ts` (cite-or-discard, cap 0.9, `contradictory`
  forces `outcome: 'fail'` so engine Rule 5 actually fires).
- `src/cli/` + `bin/sugarbee.ts` — `run(argv, io): number`, pure/sync, all writes
  via injected `Io`. **The bin is the credential boundary.**
- `src/eval/harness.ts` — `runEvaluation` over `fixtures/`. Relevance is scoped to
  `outcome === 'fail' || 'warning'` (`:269`), so a `not_applicable` finding is
  inert for eval by construction.

**⚠ `question` and `supportingFacts` are transmitted in the TRUSTED region of the
prompt — outside the SEC-5 envelope, which wraps only `excerpts`.** Any
repository-derived text placed there must be sanitized. LG-009 was the first check
to need this; see its identifier allowlist.

---

## 5. The framework — ClaudeOrchestrator, and what changed

**Do not write anything to ClaudeOrchestrator.** It exists to provide tools for the
build: agents, commands, hooks, the router. Project state lives in the *product*
repo. This was established on the first turn of the last session, when SugarBee's
`P-001…P-005` receipts were found colliding by filename with the framework's own
`P-001…P-022` development packets. The fix was structural: memory moved here,
control repo stays framework-only.

**Canonical has advanced four packets since this project's base (`7ef50e8` →
`0a63f66` on `claude/add-build-os`):** P-023 project-agnostic bootstrap, P-024
measured activation boundary + actionable DEGRADED for vendored copies, P-025
zero-touch global bootstrap. Framework files changed:
`.claude/hooks/session-start-build-os.sh`, `install-global.sh`,
`tests/build_os_tests.sh`, and a new `build-os/tools/project-bootstrap.sh`.

**Adopting it is now safe and mechanical, which it was not before.**
`project-bootstrap.sh` is explicitly designed for this: it refreshes MANAGED files
(agents, commands, hooks, `tool_router.md`, the managed `CLAUDE.md` block, the
`settings.json` wiring) and **NEVER overwrites** `build-os/memory/current_state.md`,
`build-os/memory/residue.md`, `build-os/packets/**`, or `build-os/receipts/**`. It
has an atomic lock, a transactional promote with rollback, and drift detection.

**Recommended first action for the new session:** adopt the new framework via that
bootstrap rather than by hand, then verify this project's memory and receipts are
untouched (`git diff --stat build-os/memory build-os/receipts` should show nothing
under `receipts/` or the two memory files). Do **not** `git merge` canonical — the
receipt-filename collision that motivated the migration still exists in history.

**Known caveat:** a stray branch `claude/sugarbee-project-handoff-ic47uc` exists on
ClaudeOrchestrator's remote, pointing at `7ef50e8`. It carries **zero** commits of
its own (verified: `origin/claude/add-build-os..7ef50e8` is empty, and `7ef50e8` is
an ancestor of canonical). It was created in error and the git proxy returns **HTTP
403 on ref deletion**, so it could not be removed from a session. Delete it from
the GitHub UI or a local clone if you want the repo tidy. Do not add to it.

---

## 6. How work is done here — the Build OS protocol

Every substantive change goes through the subagent loop, not ad-hoc edits:

1. **build-orchestrator** — routes, shapes, decomposes. **Never implements.**
   Verifies branch base, declares a Tool Budget, produces a ≤2-commit packet with
   done criteria, an explicit assertion-change budget, and a pre-mortem of traps.
   Invoke first on "what's next" / "keep going" / architecture.
2. **builder** — implements one confirmed packet, test-first, ≤2 commits,
   **Commit-1 green in isolation**, no external mutation.
3. **qa** — independent re-derivation: full suite with exact counts, Commit-1
   isolation in a *fresh `npm ci` worktree*, per-fixture report hashes, safety
   grep. Proof, not opinion. RED blocks close.
4. **reviewer** — one verdict: `pass` / `fix-then-pass` / `fail`. Adversarial,
   spec-faithful. No edits.
5. **archivist** — writes `build-os/receipts/<id>.md` and updates
   `build-os/memory/`. Touches `build-os/` only.

Main session drives: orchestrator → builder → qa + reviewer (in parallel) → fix
loop → push → archivist → commit the receipt.

**This loop earns its cost.** Three of the last four packets needed a
`fix-then-pass` round, and in every case the finding was **a false verdict on a
correct repository that a fully green suite would have shipped.** Do not treat a
green suite as sufficient.

### Process rules learned the hard way

- **Hold all `build-os/` commits until the packet closes.** A `build-os` commit
  landing mid-packet was absorbed by a builder `--amend` and had to be repaired
  via reflog. Holding removes the collision class entirely.
- **`--amend` is unsafe on this branch** — other agents commit concurrently.
  Verify `HEAD` is your own commit first.
- **Don't commit while a subagent is writing.** An archivist mid-write was
  captured, producing a record that showed a packet both closed and in flight.
- **Verify git state against `ls-remote`, not tracking refs.** A stale
  `origin/...` ref made a never-pushed branch report as `0/0` in sync for an
  entire session.
- **Direction checks must exercise the shape whose name they carry.** Two tests
  were caught passing while not testing their own hazard.
- **Publish per-fixture report hashes with BOTH the root token and the clock.**
  A whole-corpus aggregate is scan-path dependent (`repo.root` is embedded) and
  the digest is clock-dependent. Convention: sha256 of `serializeReport` with
  `report.repo.root` → literal `<ROOT>`, first 16 hex, at fixed clock
  `2026-07-23T00:00:00.000Z`. Baseline against the **A-S3** receipt table.

---

## 7. The hard-won design rules — read before writing any detector

These came out of four packets of adversarial review and are **binding**. Full text
in `build-os/memory/residue.md` under Standing constraints.

### The defeater taxonomy

Apply to any branch that **certifies** (`pass`/`confirmed`) **or** asserts a
deterministic claim into a prompt. Ask *"is there evidence of X that nothing else
and nothing later defeats?"* — and enumerate the defeaters:

1. **A sibling that overrides** — e.g. permissive RLS policies combining with `OR`.
2. **A later statement that revokes** — `DISABLE`, `DROP`, `ALTER`.
3. **A lexical context that makes it inert** — comments, string literals, dead code.
4. **A qualification mismatch that hides it** — schema-qualified names, aliases.
5. **A semantic equivalent unrecognised** — `USING (1=1)` for `USING (true)`.
6. **A collection boundary that never read it** — carrier predicates, extension
   gates, caps, `node_modules`.

**Classes 1–5 concern text the scan saw; class 6 concerns text it never read.**
Class 6 is the one most likely to be missed, and it retroactively covers three
separate defects across three packets. The builder that hit it put it best:

> *"It is the one my own polarity argument was blind to, because I reasoned about
> the text the scan saw and never asked what it never read."*

### Two governing rules

- **Denylist of defeaters, not allowlist of positives.** A missing positive costs a
  false `unknown` (safe). A missing defeater costs a false certification or a false
  assertion (unsafe).
- **Widening-direction rule.** For any predicate gating a claim, state which
  direction widening its input moves the claim, and prefer the widening that can
  only weaken it.
  **Corollary:** *widen the search for a signal; keep narrow the predicate that
  gates applicability* — and **parameterize them separately.** This is the third
  independent arrival at the same shape (`selects`/`anchor`; `prefers` bands;
  `rlsScanText`/`isSchemaCarrier`): **when one predicate is doing two jobs, split
  it before something silently widens the wrong one.**

### Why LG-009 ships with both deterministic branches withheld

The single most important precedent in this project. LG-009 emits only
`not_applicable`, `unknown`, or model-derived `inferred` verdicts capped at 0.9.

- **The `confirmed` fail** was withheld at shaping time. Absence of RLS is not
  evidence of missing tenant isolation — application-layer scoping is legitimate
  and more common. Five false-blocker routes were found before implementation
  began, and the modal one (a Prisma `$extends` app) is **the dominant architecture
  of the target population**.
- **The `confirmed` pass** was implemented, reviewed, fixed twice, then withdrawn
  by user decision after **seven false-certification routes across four adversarial
  passes** — each pass finding new ones. The worst: RLS DDL inside a string literal
  certified a repo with **zero** RLS.
- **The deciding argument:** because the ceiling is structural, **`pass` and
  `unknown` produce the identical decision and exit code.** The branch bought a line
  of report text and a skipped model call, against the risk of certifying tenant
  isolation on a repo that has none. What settled it was not the length of the list
  but **that it kept growing.**
- Four of those routes are now unreachable **by absence of the branch**, not by
  patching. That is the right kind of closure.

---

## 8. Hard rules — do not violate

- **No merge, no PR without explicit user go.** Hard stops.
- **Push to the working branch is standing-authorized** — but only after **qa green
  + reviewer pass + a safety grep**, as a fast-forward.
- **Never write to ClaudeOrchestrator** (§5).
- **Model-layer safety boundary:** `RealModelClient` is bin-only, uses built-in
  `fetch`, no SDK, reads no `process.env`. `FakeModelClient` drives **all** tests —
  no real API call or credential in build/test, ever. The model receives only
  deterministically-surfaced, already-redacted excerpts wrapped as SEC-5 delimited
  untrusted data; no tools; cite-or-discard; at best `inferred`, capped 0.9.
  **Sanitize any repository-derived text placed in `question` or
  `SupportingFact.statement`** — those are trusted-region fields.
- **Emit-only:** `engine.ts` and `schema/index.ts` stay byte-identical.
- **externalVerification obligation:** never present repo evidence as provider-side
  proof. LG-012 is the last pending external check and lands last (A-S7).
- **TEST-DATA POLICY:** every key-shaped fake keeps a short suffix (<20 contiguous
  alphanumerics) and no Sentry-DSN shape, on **every** surface including receipts
  and memory. GitHub push protection is on. **Never allowlist a secret — reshape
  the data.**
- **Zero-fixture-movement posture** has held three consecutive packets
  (`fixtures/` tree `a981446bac76039147d93efedd14a092c2aeadc1`). Any change is a
  disclosed decision, not a default.
- **Commit hygiene:** author/committer `noreply@anthropic.com`; end every commit
  body with the `Co-Authored-By` + `Claude-Session` trailer. Never put a model
  identifier in commits, PRs, or code.
- **GitHub access is via the `mcp__github__*` MCP tools** — there is no `gh` CLI.
  Note the git proxy returns **403 on ref deletion**.

---

## 9. The exact next step

**A-S4 is staged as a candidate in `build-os/packets/active_packet.md`** — not
shaped, not authorized. The orchestrator shapes it; the user gives the go.
Remaining detectors: **LG-007, LG-011, LG-012, LG-013.** That file carries nine
binding shaping inputs; the two that will shape the choice:

- **LG-011 is NOT the safe option.** It was examined at A-S3 shaping and found to
  walk straight into the `process.env.X ?? 'http://localhost:3000'` dev-fallback
  idiom **this program already refused once** (LG-001 source-path scanning), at
  `confirmed`/Rule-2/`not_ready` with no override. It also has its own carrier
  problem (`.html`/`.mjml`/`.hbs` are not surfaceable) with **no** "the D layer may
  read it completely" escape, because the answer depends on *resolution* of an env
  variable rather than the presence of a literal. **It is unexamined, which reads
  as lower risk and is not.**
- **LG-012 is the owed structural variant for the `ModelCheck` seam.** The
  settles-`pass` shape the seam was justified against is currently **unproven**
  (LG-009 entered as settles-`pass` and left as settles-nothing), and LG-012's
  `externalVerification`-on-unknown is the next genuinely different shape. But
  LG-012 lands last (A-S7).

---

## 10. Two decisions waiting on the user

Both are recorded in memory and were raised repeatedly without resolution. Neither
blocks building.

1. **This repo has no default branch.** No `main`, no `master`, local or remote —
   only `claude/*` branches, and `origin/HEAD` is unset. So "never merge without
   go" has **no target** and an eventual PR has **nowhere to land**. Flagged in five
   consecutive packets.
2. **Second-eyes review is unavailable.** `codex` is not on PATH, no Codex plugin is
   present, and the connected MCP servers contain no code-review tool. Every review
   across five packets was single-model analysis plus empirical probes. Given that
   **seven certification defects were found by adversarial passes rather than by the
   suite**, the reviewer asked that this be recorded as a standing process risk
   rather than a recurring footnote. It is.

---

## 11. Naming and gotchas

- Renamed LaunchGraph → **SugarBee.ai** (brand) and `launchgraph` → `sugarbee`
  (CLI/package/`.sugarbee/` dir/`SUGARBEE_*` env/`bin/sugarbee.ts`).
- **Check ids keep the `LG-` prefix** — spec-declared "stable, versioned", ~414
  occurrences. Moving them to `SB-` is a deliberate separate packet.
- The **GitHub repo slug is still `LaunchGraph`** — not renamable from a session.
- **Closed receipts `P-001…P-005` still say "LaunchGraph"** — preserved as
  append-only history. `A-S1b`/`A-S1c`/`A-S2`/`A-S3` are the recent ones.
- The spec header still says "not yet implemented" — stale, tracked in residue.
- **Receipts are append-only.** A correction to a closed receipt goes in the *next*
  receipt, never by editing the old one. Three such corrections exist; they are
  labelled as corrections rather than quietly folded in.
