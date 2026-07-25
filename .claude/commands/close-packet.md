---
description: Close the active packet — write a receipt and update Build OS memory via the archivist.
argument-hint: "[optional packet id]"
---

Close the active build packet by recording it durably.

Use the **archivist** subagent to:

1. Gather the packet facts: id, title, what changed, the qa proof block (exact
   counts), the reviewer verdict, the commits (`git show --stat`), and the branch
   base.
2. Write `build-os/receipts/<id>.md` with scope, commits, QA proof,
   reviewer verdict + Codex note, residue, and any open merge/deploy/push
   boundaries awaiting explicit go.
3. Update `build-os/memory/current_state.md`, `build-os/memory/residue.md`, and
   `build-os/packets/active_packet.md` (mark the packet closed; stage the next if
   known).

The archivist only touches files under `build-os/`. It does not push, merge, or
deploy. Report the receipt path and the memory files updated.

Packet (optional): $ARGUMENTS
