# Receipts

Durable, append-only history of closed packets. The **archivist** writes one
file per packet here, named by packet id: `build-os/receipts/<id>.md`
(e.g. `P-001.md`). Receipts are never rewritten — closing a packet adds a new
file; corrections are new receipts that reference the old one.

## Receipt template

Copy this into `build-os/receipts/<id>.md` when closing a packet:

```markdown
# Receipt — <id>: <title>

- **Date:** <YYYY-MM-DD>
- **Branch base (merge-base):** <hash / ref>

## Scope
- **In:** <what this packet covered>
- **Out (explicit):** <what was deliberately excluded>

## Commits
- <hash> <subject>
- <hash> <subject>

## QA proof
- Suite:        <cmd> → N passed, M failed, K skipped
- Regression:   <cmd/scope> → result
- Commit-1 iso: <how verified> → green/red
- Safety grep:  <hits or "none found">
- UI smoke:     pass / fail / N/A

## Review
- Verdict: pass / fix-then-pass (as fixed) / fail
- Codex second-eyes: <summary, or "not available">
- Product Trajectory Check: <note>

## Residue
- Deferred / follow-up packets: <…>
- Known risks: <…>

## Open boundaries (awaiting explicit go)
- <merge / deploy / push / secret left pending, or "none">
```
