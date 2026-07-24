# LaunchGraph

Claude Code builds your application. LaunchGraph launches and verifies the
business around it.

LaunchGraph is a repository-first launch operator installed into Claude Code,
Codex, and other agentic development environments. It reads a codebase, infers
the business being built, inspects connected provider state, identifies
everything missing between "the application runs" and "the business works,"
and coordinates remediation, configuration, approvals, and verification —
asking the person only when human authority is genuinely required.

## Documentation

* [Complete Product Scope](PRODUCT_SCOPE.md) — the full product definition:
  problem, product form, routing engine, approvals, recipes, provider
  adapters, environment separation, rollback, cost governance, ownership,
  verification, commercial model, implementation phases, and the narrowed
  first-product wedge (LaunchGraph Production Readiness).
* [Phase 1 Specification: Repository Auditor](specs/phase-1-repository-auditor.md) —
  the read-only MVP: supported stack, the 15 readiness checks, deterministic
  versus model-assisted detection, finding and evidence schemas,
  readiness-decision rules, remediation-package format, fixtures and
  evaluation, security requirements, CLI experience, acceptance tests, and
  explicitly deferred functionality.

## CLI

The Phase 1 auditor ships as a local `launchgraph` command that wraps the
deterministic detector library. It is strictly read-only: it statically parses
a repository, never executes it, never reads host credentials, and performs no
network egress.

### Install / run

The bin runs through [`tsx`](https://tsx.is) (a dev dependency; there are no
runtime dependencies):

```
npm run scan -- <path> [flags]     # scan a repository
npm run eval                       # run the fixture evaluation harness
# or invoke the bin directly:
npx tsx bin/launchgraph.ts scan <path> [flags]
```

### Commands and flags

```
launchgraph scan [path]            # scan a repository (default path: ".")
  --json            emit the canonical JSON report to stdout (writes no files)
  --out <dir>       output directory (default: <path>/.launchgraph/)
  --offline         deterministic layer only; no network at all
  --checks <ids>    run a subset, comma-separated (e.g. LG-001,LG-004)
  --app <path>      select the app in a monorepo (relative to the scan path)
launchgraph eval                   # run the fixture evaluation harness (repo dev)
```

### Exit codes (§11.4)

| Code | Meaning |
|---|---|
| `0` | decision `ready` or `ready_with_warnings` |
| `1` | decision `not_ready` |
| `2` | scan error (or a usage/parse error) |
| `3` | decision `not_evaluated` (unsupported stack) |

The exit code is driven solely by the decision value, so CI can gate on the
auditor directly. It is identical in `--json` and default modes.

### Output files

In default mode the auditor writes two files into the output directory
(`--out`, else `<path>/.launchgraph/`):

- `report.json` — the canonical, byte-deterministic §5 `Report`.
- `report.md` — the human evidence package: the decision, blockers before
  warnings, each finding's evidence path, classification qualifier, and its
  secret-redacted excerpt, plus dedicated external-verification and "needs your
  confirmation" sections. All writes are confined to the output directory.

### Unsupported stacks

A repository that is not a supported Next.js/TypeScript stack is not evaluated:
the auditor emits a stack report and the decision `not_evaluated`, exits `3`,
and surfaces no defect findings — honest refusal rather than junk output.

### The `--offline` note

Every check shipped today is deterministic and already runs fully offline, so
`--offline` changes nothing about current results — it is an honest, forward-
looking flag. Once model-assisted checks exist, `--offline` will disable them
and mark those checks `unknown` (never fabricating their results).

## Status

Phase 1 (Repository Auditor) is under active implementation. The deterministic
detector library and the `launchgraph` scan/eval CLI documented above are in
place; the model-assisted layer (§4.2) and the remaining §3 checks are still
pending, so a scan currently reaches at best the Phase 1 `ready_with_warnings`
ceiling over the wired subset of checks
(LG-001/002/003/004/008/010/014/015). Full scope lives in
[PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) and the
[Phase 1 Specification](specs/phase-1-repository-auditor.md). Nothing has been
merged, deployed, or published without explicit go.
