<!-- BUILD-OS:START (managed by install-project.sh) -->
## Build OS (global)

This machine runs a native **Build OS** orchestrator, installed at user scope so
it applies to **every** Claude Code session in **every** project. Use the
**build-orchestrator** for architecture/planning, substantive build packets,
ambiguous scope, and gated work. Read-only answers, diagnosis-only work, and
tiny reversible edits use the router's direct/lightweight lanes. The
orchestrator routes; it never implements.

Per-project state lives in that project's `build-os/` directory
(`build-os/memory/`, `build-os/packets/`, `build-os/receipts/`). If the current
repo has no `build-os/`, the orchestrator still routes — it just has no
persistent memory yet. Scaffold one with `init-build-os.sh` (or `/init-build-os`)
when you want continuity in a project.

### Per-task protocol

1. **Classify** the task type, weight, and authority.
2. **Read the router — in this order:** (a) the project's
   `build-os/memory/tool_router.md` if present; else (b) the user-scope
   `~/build-os/memory/tool_router.md`; else (c) the
   **embedded proportionate lanes** below. Pick the matching row from the first
   source that resolves.
3. **Declare a Tool Budget** — the exact tools/agents you will use.
4. **Announce** it on one line: `Tools: [x] — why`.
5. **Budget breach = stop.** Needing a tool or authority outside the declared
   budget is a hard stop for explicit go, not a silent expansion.
6. **Close substantive build packets** with a receipt via the archivist
   (`build-os/receipts/<id>.md`). Read-only, diagnosis-only, and tiny-edit lanes
   require no packet, reviewer, archivist, or receipt unless risk forces
   escalation.

### Proportionate lanes

- **Read-only answer / explanation:** direct evidence-based response.
- **Diagnosis / triage:** investigate and report; do not implement unless asked.
- **Tiny reversible local edit:** one direct builder-lite pass and one targeted
  check.
- **Substantive build:** builder → qa → reviewer → archivist.
- **Architecture / ambiguity / gates:** build-orchestrator.

### Hard gates

- **Design / UI** work is **frontend only**.
- **Marketing / media** work happens **only inside marketing/media packets**.
- **Agent swarm** is allowed **only for parallelizable work and only with an
  explicit merge plan**.
- **No external mutation without explicit go** — never push, merge, deploy,
  publish, or touch secrets without an explicit go from the user.

### Working contract

- **Verify the branch base** (`git merge-base`) before building.
- **≤2 commits** per packet; **Commit-1 green in isolation**.
- **Full proof + safety grep** before a packet closes (qa reports exact counts).
- **Never merge/push/deploy without go.**
<!-- BUILD-OS:END -->
