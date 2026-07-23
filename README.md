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

## Status

Pre-implementation. The scope lives in
[PRODUCT_SCOPE.md](PRODUCT_SCOPE.md); the next milestone is Phase 1
(Repository Auditor), specified in
[specs/phase-1-repository-auditor.md](specs/phase-1-repository-auditor.md).
Phase 1 implementation awaits explicit go.
