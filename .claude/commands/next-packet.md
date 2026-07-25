---
description: Route the next build packet via the build-orchestrator (architecture, next steps, tool routing, "keep going").
argument-hint: "[optional focus / packet hint]"
---

Use the **build-orchestrator** subagent now to determine and route the next
build packet.

Have it run its full on-invocation sequence:

1. Load `build-os/memory/current_state.md`, `build-os/memory/residue.md`, and
   `build-os/packets/active_packet.md`.
2. Run `git status` and verify the branch base with `git merge-base`.
3. Classify the task's authority and apply the `CLAUDE.md` hard gates.
4. Read `build-os/memory/tool_router.md` and pick the matching row.
5. Declare the **Tool Budget**.
6. Announce `Orchestrator: ON — routing from <file|embedded>`.
7. Delegate to **builder / reviewer / qa / archivist** as the budget dictates,
   stopping at any merge / deploy / secret / push boundary for explicit go.

Focus / hint (optional): $ARGUMENTS
