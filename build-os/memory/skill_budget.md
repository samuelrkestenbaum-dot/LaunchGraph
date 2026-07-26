# Skill Budget Policy (P-011)

Claude Code loads skill metadata (name + description) for **every enabled skill** at
startup, against a budget (~30,000 chars). Exceeding it **truncates skill discovery**, so
purpose-built tools can become invisible to routing. Observed on the host at startup:

> **Skill listing over budget: 685 skills, 171824 chars > 30000** — ~5.7× over.

## Policy: a deliberate minimal active skill set

Keep the strongest broadly-useful build capabilities; disable redundant / rarely-used
bundles. Target: total skill metadata **under budget**, with the warning gone. Do not
blindly keep redundant skills, and do not blindly delete useful ones.

**Keep (broadly-useful build capability):**
- Core Anthropic document/build skills: `docx`, `pdf`, `pptx`, `xlsx`, `dataviz`,
  `skill-creator`, `mcp-builder`, `web-artifacts-builder`, `artifact-*`.
- The **curated Trail of Bits security subset only** (per-task): `constant-time-analysis`,
  `zeroize-audit`, `supply-chain-risk-auditor`, `agentic-actions-auditor`,
  `insecure-defaults`, `static-analysis`, `variant-analysis`, `differential-review`,
  `seatbelt-sandboxer`.
- `context-mode` (context compression, pilot).

**Disable (dominant / redundant):**
- `ecc@ecc`: 363 skills and substantial overlap with GSD, Superpowers, Codex, the
  focused design/document plugins, and Build OS itself.
- Any additional "everything" / mega bundle only if a fresh debug run again exceeds
  the budget.

## Procedure

1. **Audit the enabled startup set** (read-only, safe to run anywhere). Prefer the
   **enabled-aware** mode so installed inventory is not mistaken for the startup budget:
   `build-os/tools/skill-budget-audit.sh --claude-dir ~/.claude 30000`
   → reports **installed inventory** (de-duped by `installed_plugins.json` installPath) and,
   separately, the **startup-enabled** set (only `settings.json` `enabledPlugins`), and checks
   only the enabled set against budget. The legacy `skill-budget-audit.sh <plugins-dir>` still
   works for a bare plugins tree but labels any over-budget note as *installed inventory*, not a
   startup verdict.
2. **Disable the enabled dominators** it lists (plugin/skill settings or
   `claude plugin disable <name>`), keeping the minimal set.
3. **Re-audit** until the startup-enabled set is under budget, then start a **fresh debug
   session** (`claude --debug`) and confirm the "Skill listing over budget" warning is **gone**.

> **Do not conflate installed inventory with the startup budget (P-016).** Walking every
> `~/.claude/plugins/cache/**` and `**/marketplaces/**` SKILL.md double-counts the same plugin
> and massively over-reports (observed 2,584 skills / 20M chars). Only **enabled** plugins load
> at startup; count those, de-duped by installPath.

> **Full SKILL.md bodies are NOT the startup metadata cost (P-017).** An enabled-set of ~1.7M
> body chars can still load with no truncation warning, because the loader indexes frontmatter
> name/description, not whole files. The audit therefore reports enabled **full-body inventory**
> separately and marks the startup metadata status **UNKNOWN from files alone** — it does not
> assert within/over budget from file bodies. A fresh `claude --debug` session is authoritative
> for whether the real startup metadata is under budget.

## Applied host result (P-012)

- `ecc@ecc` disabled; focused GSD, Superpowers, Codex, document/design, Context Mode,
  memory, and security capabilities retained.
- `skillListingBudgetFraction: 0.18` set at user scope.
- Fresh authenticated debug session loaded 149 directory commands, 170 plugin skills,
  and 35 bundled skills with **no skill-budget warning**, then returned the requested
  response within the configured cost cap.
- `repair-host-integrations.sh` enforces this state after future plugin updates.

## Reversible specialist profiles (P-013)

Disabled does not mean removed. Run:

- `build-os/tools/capability-profile.sh focused` — fast default.
- `build-os/tools/capability-profile.sh ecc` — restores all 372 ECC skills, 67 agents,
  hooks, and Chrome DevTools MCP for a specialist engineering session.
- `build-os/tools/capability-profile.sh zeroize` — restores the zeroization-audit skill
  and agents, swaps pinned user Serena for the plugin's bundled Serena, and prevents a
  duplicate server.
- `build-os/tools/capability-profile.sh status` — read-only current state.

Restart Claude Code after switching. The `/capability-profile` command exposes the same
workflow inside Claude.

## Zero-touch handoff (P-014)

`build-os/tools/specialist-handoff.sh` (wired into the `prompt-router.sh` prompt-entry hook)
auto-detects when a request needs ECC or zeroization and, only then, activates that profile
for a fresh non-interactive child session — ECC temporarily raises `skillListingBudgetFraction`
to 0.40 for the child — and **always restores focused (0.18) afterward**. Focused requests
incur no relaunch and no budget change, so the default session stays under budget.
