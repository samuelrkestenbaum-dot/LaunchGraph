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

## Status

Pre-implementation. The current milestone is the scope in
[PRODUCT_SCOPE.md](PRODUCT_SCOPE.md); the first buildable target is the
production-readiness and launch-verification layer described in Part II.
