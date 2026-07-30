---
description: Switch between focused, ECC, and zeroization-specialist Claude profiles
argument-hint: focused | ecc | zeroize | status
---

Run `build-os/tools/capability-profile.sh $ARGUMENTS` from the Build OS repository.
If no argument was supplied, use `status`. Report the resulting profile and remind the
user that a fresh Claude Code session is required to load it.

Profiles:
- `focused` — fast default; focused plugins plus pinned user Serena.
- `ecc` — restores all ECC skills and agents for specialist engineering work; retains
  pinned user Serena and allocates the larger skill-listing budget.
- `zeroize` — restores the zeroization-audit workflow and its bundled Serena; removes
  the user Serena so exactly one server remains.

Never enable ECC and zeroize simultaneously. Do not merge, deploy, or change secrets.
