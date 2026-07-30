# Tool Router

The routing matrix. The **build-orchestrator** reads this on every invocation,
matches the task to a row, and declares its Tool Budget from it. If no row
matches, it routes from embedded defaults and says so.

> Columns: **Task type** · **Authority** · **Route (agents)** · **Tools** ·
> **Gate / stop**

| Task type | Authority | Route (agents) | Tools | Gate / stop |
|---|---|---|---|---|
| Read-only answer / question | build | build-orchestrator *or direct* (no builder chain) | Read, Grep, Glob | answer only; no edits, no packet, no qa/reviewer/archivist |
| Diagnosis / triage (no edits) | build | qa *or direct* (no builder chain) | Read, Grep, Glob, Bash (read-only) | report findings only; if a fix is needed, propose a packet — don't implement here |
| Tiny reversible local edit | build | builder-lite (single agent, direct) | Read, Grep, Glob, Edit, Write, Bash | in-scope, local, trivially reversible; ≤1 commit; **no qa/reviewer/archivist unless risk**; escalate to the Build row if it grows |
| Build / feature / bugfix | build | builder → qa → reviewer → archivist | Read, Grep, Glob, Edit, Write, Bash | ≤2 commits; Commit-1 green in isolation; no push/merge |
| Architecture / "what's next" / planning | build | build-orchestrator only (no edits) | Read, Grep, Glob, Bash | route to a packet, don't implement |
| Design / UI | design-ui (frontend only) | builder (frontend scope) → qa (UI smoke) → reviewer → archivist | Read, Grep, Glob, Edit, Write, Bash | frontend files only; no backend/runtime reach-in |
| Marketing / media | marketing-media | builder (marketing/media packet scope) → reviewer → archivist | Read, Grep, Glob, Edit, Write, Bash | only inside marketing/media packets; no product code |
| Agent swarm / parallel work | agent-swarm | build-orchestrator fan-out → per-task builders → reviewer (merge) → archivist | Read, Grep, Glob, Edit, Write, Bash | parallelizable work only; explicit **merge plan** required |
| QA / proof / regression | build | qa | Read, Grep, Glob, Bash | report exact counts; RED blocks close |
| Review / second-eyes | build | reviewer | Read, Grep, Glob, Bash | no edits; verdict only |
| Close / receipt / memory | build | archivist | Read, Write, Bash | touches `build-os/` only |
| Infra / deploy / release | infra-deploy | build-orchestrator (gate) | Read, Grep, Glob, Bash | **STOP** — deploy/merge/secret need explicit go |
| Secrets / credentials | infra-deploy | build-orchestrator (gate) | Read, Bash | **STOP** — never read/write/rotate without explicit go |
| Push / merge to base | infra-deploy | build-orchestrator (gate) | Bash | **STOP** — never push/merge without explicit go |

## Embedded defaults (no matching row)

- Route from the requested outcome, using the smallest safe lane:
  - read-only answer / explanation → direct; `Read, Grep, Glob`
  - diagnosis / triage → direct or `qa`; read-only tools; report, do not fix
  - tiny reversible local edit → `builder-lite` + one targeted check
  - substantive feature / bugfix / multi-file build → `builder → qa → reviewer
    → archivist`
  - architecture, ambiguous scope, or gated work → `build-orchestrator`
- Stop before external mutation. Announce
  `Orchestrator: ON — routing from embedded`.

## How to extend

Add a row per new task type. Keep the **Gate / stop** column honest — every row
that can cross a merge/deploy/secret/push boundary must say **STOP** there.

## Proportionate routing (don't over-orchestrate)

Match the route to the task's real weight. The full `builder → qa → reviewer →
archivist` chain is for **build / feature / bugfix** work — it is **not** the
default for everything:

- **Read-only answers / questions** → answer directly (or via build-orchestrator);
  Read/Grep/Glob only; no packet, no builder chain.
- **Diagnosis / triage (no edits)** → investigate and report (qa or direct);
  read-only Bash allowed; if a fix is warranted, *propose a packet* instead of
  implementing inline.
- **Tiny reversible local edit** → a single builder-lite pass; ≤1 commit; skip
  qa/reviewer/archivist **unless** the edit carries real risk.

**Escalate, never silently expand.** The moment a "tiny" edit needs new files,
touches shared/runtime logic, or stops being trivially reversible, stop and
re-route to the full **Build / feature / bugfix** row.

## Tool selection ranking (overlapping tools)

When more than one capability could do the job, pick with this ranking (earlier
wins):

1. **Exact task match** — the tool purpose-built for this exact job.
2. **Project-local instruction** — what this repo's config / router / CLAUDE.md says.
3. **Enabled / live evidence** — verified live via a registry/tool call, not a
   cache entry (see *Availability = live proof* below).
4. **Least privilege** — the read-only / narrowest-scope option that still works.
5. **Lowest orchestration overhead** — fewest agents/steps for the same result.
6. **Freshest verified result** — most recently confirmed working.

Use **one primary capability** per job. Add a second only when it has a
**distinct, necessary** role (e.g. Serena for symbols *and* Repomix for a handoff
snapshot) — not as redundant overlap.

### Availability = live proof, not cache

A plugin / skill / MCP appearing in a **filesystem cache** (`~/.claude/plugins/**`)
is a **candidate**, not proof it is active. Before routing to it or calling it
ACTIVE, confirm with a **live** signal: `ListPlugins` / `ListConnectors` /
`ListSkills`, the `enabledPlugins` set in settings, or a real `mcp__<server>__*`
tool call. The SessionStart inventory labels cache entries as *candidates* for
exactly this reason.

### Canonical MCP servers (one live server per job, no duplicate launches)

Run **one canonical live server per job** — never two servers that do the same
thing. When duplicates exist, prefer in this order:

1. a **pinned, user-configured** server (explicit version in `.mcp.json` /
   `~/.claude.json` / settings), over
2. a **plugin-bundled** copy, over
3. an unpinned **`@latest`** invocation.

Concretely: do **not** launch a second **Serena** when one is already live, and do
**not** run **Chrome DevTools MCP** alongside another browser/devtools server for
the same task. Pick the single pinned/user-configured instance and route all of
that job's calls through it. Redundant launches waste resources, split state, and
make "which one answered?" ambiguous. If two are already running, use the pinned/
user-configured one and note the duplicate.

## External tool routing (use when connected)

Route to these **only when connected** in the current environment; otherwise fall
back to native tools and name the missing capability in the Tool Budget. These
rows are **preferences, not a whitelist** — the orchestrator also uses any *other*
capability already connected in the session (skills, slash commands, subagents,
MCP servers) that fits the task. The SessionStart hook surfaces the live
inventory; default to "it's probably connected — check," not "it's absent."
⚠️ The tool/repo handles below are common names — if you ever *install* something
new, **verify the exact package/repo first**; ecosystem names are easy to mistype.

> **Preference vs. verified.** The table below is a *preference map* and may name tools
> that are **not** installed here. Two verified categories differ: **local Claude Code
> plugins** (in `claude plugin list` — see *Build accelerators*) and **remote/org
> claude.ai capabilities** (in the app's ListConnectors/ListPlugins — see *Remote / org
> capabilities* below), which are **not** in the local CLI registry. **No-route-to-
> unverified:** route to a capability only after confirming it is live in the CURRENT
> surface; fall back to native tools (saying so) when it is absent.

| Task type | Preferred external tool(s) | Used by | Gate |
|---|---|---|---|
| Web research / live docs | Perplexity MCP, native WebSearch/WebFetch | build-orchestrator, builder | read-only — normal budget |
| Site scrape → context | Firecrawl MCP (`firecrawl-mcp-server`) | builder, build-orchestrator | read-only — normal budget |
| Browser / UI QA / screenshots | Playwright MCP (`@playwright/mcp`), Chrome DevTools MCP (`chrome-devtools-mcp`) | qa | read-only drive; no prod actions |
| Second-eyes code review | Codex (`codex` CLI / Codex-for-Claude-Code plugin) | reviewer | read-only — normal budget |
| Repo → LLM context pack | RepoMix (`repomix`) | build-orchestrator, builder | read-only — normal budget |
| Parallel multi-agent work | Claude Squad / parallel sub-agents | build-orchestrator (agent-swarm) | **merge plan required** |
| Send mail / message / SaaS write | Gmail, Slack, Notion, HubSpot, Supabase MCP (write ops) | builder | **STOP** — external mutation, explicit go |
| Design / UI polish | `design` plugin (claude.ai org — verify per surface) — UI/UX, design-system | builder (design-ui) | frontend only |
| Media generation | Higgsfield (installed connector) / Glif / Remotion | builder (marketing-media) | marketing/media packets only |

### Remote / org capabilities — claude.ai (NOT in the local Claude Code plugin registry)

⚠️ **Remote/org, not local-CLI-verified.** These are **claude.ai org-level** plugins,
confirmed only via the claude.ai app's `ListPlugins` — they do **NOT** appear in the local
Claude Code plugin registry (`claude plugin list`) and are **not** the locally-installed
CLI plugins (the Trail of Bits curated set, `claude-hud`, `context-mode` — see *Build
accelerators*). **No-route-to-unverified:** route to one of these only after confirming it
is live in the CURRENT surface (an `mcp__*`/tool call or the app's live registry) — org-level
enablement is not proof it is reachable from a local Claude Code CLI session. Mutations
(send/file/publish/remote-DB-write) are a **STOP** for explicit go.

| Plugin | Build capability | Authority | Gate / stop |
|---|---|---|---|
| `design` | UI/UX, design-system, visual polish | **design-ui — frontend only** | frontend files only; no backend/runtime reach-in |
| `data` | Spreadsheets, analysis, data shaping/viz | build | read/analyze normal; **STOP** on remote-DB writes |
| `productivity` | Docs, tasks, notes, scheduling workflows | build | read normal; **STOP** on external send/write |
| `brand-voice` | Voice/tone, de-slop AI-sounding copy | marketing-media | marketing/media packets only |
| `marketing` | Copy, SEO, CRO, email, social | marketing-media | marketing/media packets only |
| `sales` | Outreach, CRM workflows, pipeline | build (business) | read normal; **STOP** on send/CRM write |
| `small-business` | Ops: invoicing, CRM, contracts admin | build (business) | read normal; **STOP** on external file/send |
| `legal` | Contracts, review, legal docs | build (business) | read normal; **STOP** on e-sign/file/send |
| `cowork-plugin-management` | Meta: install/enable/manage plugins | meta | plugin-management only; no product code |

### Remote / org connectors — claude.ai (verify per surface)

⚠️ **Remote/org, not local-CLI-verified.** These MCP connectors are **claude.ai org-level**,
confirmed via the app's `ListConnectors` — availability is **per surface**; they are not
guaranteed reachable from a local Claude Code CLI session and do not appear in the local
plugin registry. Apply **no-route-to-unverified**: confirm the connector is live in the
current surface before routing. Read is normal budget; **write ops are a STOP**.

| Connector | Use | Gate / stop |
|---|---|---|
| GitHub *(session MCP)* | Repos, PRs, issues, Actions/CI, code search | push/merge/PR = **STOP** |
| Supabase | Postgres DB, migrations, edge functions | migration/SQL write = **STOP** |
| Netlify | Deploy/manage sites | deploy/update = **STOP** |
| Hugging Face | Models / datasets / spaces | read-only |
| Higgsfield | Image/video/audio/3D/media generation | generate/publish = marketing-media packet + cost |
| Zapier | Bridge to 9,000+ apps | write actions = **STOP** |
| Gmail · Slack · Notion · HubSpot | Mail · chat · docs · CRM | send/write = **STOP** |
| Apollo.io · Clay | Lead gen / enrichment / outreach | send/campaign/write = **STOP** |
| Docusign | E-signature envelopes, agreements | send/create envelope = **STOP** |
| Otter.ai | Meeting transcripts | read-only |
| Claude Code Remote *(session MCP)* | Triggers, PR subscribe, add_repo, sessions | schedule/subscribe = normal; repo/session mutation = judgment |

> **Not live (out of scope until enabled):** Stripe & Cloudflare Developer
> Platform (installed, need auth), Google Calendar / Google Drive / Microsoft 365
> (installed, toggled off in-chat). Don't route to these until they're authorized
> / enabled.

### Build accelerators (verified 2026-07 — see receipt P-002)

**Discovery-first tool selection (do this every build).** (1) *Discover* live
capabilities — `ListConnectors` / `ListPlugins` / `ListSkills`, the SessionStart
inventory, and the tables in this file. (2) Select the **smallest correct
toolset** for the task. (3) In large or unfamiliar repos, prefer **symbol-level**
navigation (Serena) over broad file reads. Never claim an unavailable tool is
installed — if it's not in the live inventory, say so and fall back.

One orchestrator only (Build OS): these accelerators are *instruments*, not
competing agent frameworks. None of them makes build decisions or crosses a
production boundary on its own.

**Status semantics — use these exact labels everywhere** (tool_router, INTEGRATIONS,
memory, residue, receipts):

- **ACTIVE** — available and verified in a *newly started normal* Claude Code session.
- **DURABLY CONFIGURED** — committed config can reconstruct the tool, but it is *not
  active until restart/approval*.
- **RUNNABLE ON DEMAND** — verified via npx/uvx in *this ephemeral container*; this is
  **NOT** a persistent install on the user's Mac or globally in Claude Desktop.
- **DOCUMENTED/OPT-IN** — recipe / routing guidance only; not installed.
- **NOT INSTALLED/BLOCKED** — unavailable, ambiguous, or intentionally withheld.

**Anti-overstatement rule.** Never call npx/uvx success in an ephemeral container
"installed." Use "installed" **only** when *both* persistent host state *and* a
fresh-session activation test are verified. Keep **installation · configuration ·
activation · authentication · repository rollout** as five distinct states.

> **Provisioning status (P-012 — live host convergence).** A fresh authenticated prompt
> returned successfully with one startup signal, one routing reminder, no hook parse
> failure, and no skill-listing truncation. `ecc@ecc` is disabled; the focused skill
> stack remains enabled. Serena is one pinned user-scope MCP at official commit
> `68884f1`; `zeroize-audit` is disabled so its unpinned bundled server cannot duplicate
> it. Node 22.23.1 satisfies the Node tools; Claude HUD's visual TTY render is unverified.

| Accelerator | Route to it when… | Status (P-012 live evidence) | Gate / stop |
|---|---|---|---|
| **Serena** — MCP | Primary for symbol-level work in large or unfamiliar repos | **ACTIVE** — one user-scope `serena` server pinned to official commit `68884f1`; fresh MCP connection PASS; unpinned plugin copy disabled | local LSP only; edits flow through builder; keep ONE instance |
| **Repomix** — `repomix@1.17.0` | Explicit snapshots / handoffs only | **ACTIVE** — Node 22 host executable and fresh session PASS | hardened config; external sharing = **STOP** |
| **ccusage** — `ccusage@20.0.18` | Usage / cost visibility | **ACTIVE** — Node 22 host executable and fresh session PASS | visibility-only |
| **Claude HUD** | Operator visibility | **DURABLY CONFIGURED** — v0.6.0 enabled; visual TTY render unverified | visibility-only |
| **Trail of Bits skills** | Relevant security work only | **ACTIVE** — 8 focused plugins enabled; `zeroize-audit` disabled because its bundled MCP was unpinned | activate per task |
| **Context Mode** | Long sessions — pilot only | **ACTIVE** — v1.0.169 connected; benchmark PASS | non-secret repos only |
| **claude-code-action** | Repo-scoped GitHub assistance | **DOCUMENTED/OPT-IN** | named repo + secret + explicit go |
| **claude-code-security-review** | Repo-scoped PR security review | **DOCUMENTED/OPT-IN** | named repo + secret + explicit go |

### Specialist capability profiles

The focused profile is the fast default, not a permanent capability deletion. Before
work that materially benefits from ECC-only language/framework reviewers, browser QA,
networking, production operations, or its specialist agents, offer or invoke the `ecc`
profile for the next fresh session. Before an explicit compiler/assembly zeroization
audit, use the `zeroize` profile. Return to `focused` afterward:

`build-os/tools/capability-profile.sh {focused|ecc|zeroize|status}`

Each profile keeps exactly one Serena MCP. Never enable ECC and zeroize indiscriminately
for ordinary work; profile switching should follow exact task match and lowest overhead.

> **Repo-scoped ≠ global.** `claude-code-action` and `claude-code-security-review`
> are per-repository GitHub Action templates, **not** global plugins — never add
> them to arbitrary product repos. Minimum-permission, advisory-first install
> recipes live in `INTEGRATIONS.md` §8.

### Host specialist capabilities (P-014, surface-verified P-016 — don't duplicate)

Extra capabilities present on the host, **preserved across all profile transitions**
(the capability-profile switcher only toggles ECC / zeroize-audit / Serena — never
these). These are **INLINE current-surface routes**: the prompt hook emits a REQUIRED
directive to use them here — it never switches capability profiles and never launches a
child for them. **Verification is surface-specific** — a capability confirmed in **Claude
Desktop** (the connector/app registry) is *not* the same as one visible to the local
**Claude Code CLI** (`claude mcp list` / native skills). Confirm live in the current
surface before routing (no-route-to-unverified); never disable, duplicate, or claim a
cross-surface ACTIVE state.

| Task type | Route to (inline) | Surface & verification (2026-07) |
|---|---|---|
| UI / component discovery | **21st.dev** MCP (`mcp__21st__*` cloud; `mcp__21st-dev__*` local) | Verified live in Claude Desktop cloud Code and Mac-local Claude Code. The account connector securely holds cloud credentials, but Anthropic requires a per-call approval for web-connector tools; never bypass that with a broad wildcard or a plaintext cloud environment secret. |
| External-platform reachability / web research | **Agent Reach** (`agent-reach` skill) | **Native skill present** in Claude Code (skill registry) |
| Long-running supervision | **Claude Watch** v0.4.1 → Cloud-native fallback | **Enabled plugin on the Mac**; **absent from Claude Cloud's live registry** → when Claude Watch is not callable on the surface, use the Cloud-native supervision lane: `build-os/tools/supervise.sh` (bounded in-turn watch, no plugin) + the session scheduling primitive (`send_later` / scheduled re-check) for cross-turn supervision |
| UI/UX design work | **UI UX Pro Max** v2.11.0 | **Enabled; native skill present** (Claude Code) |

Surface note: 21st.dev uses different aliases by surface: account-level cloud connector `21st`
and Mac-local MCP `21st-dev`. Resolve the live registry name before calling and do not infer one
surface's health from the other. Cloud web-connector approval is an Anthropic UI gate, not a
project-permission setting. The other three are Claude Code skills/plugins.

**Inline directives are CONDITIONAL (P-017).** The prompt hook never claims one of these tools
was used. For each inline route it emits an **INLINE CANDIDATE**: *first verify the named tool is
connected and callable on THIS execution surface; if available, use it; if unavailable or
disconnected, continue with the closest built-in/local fallback and state that limitation — do
NOT claim a capability is available merely because it is installed.* No cross-surface shell probe
is invented; availability is judged on the surface actually handling the request.

### Skills & slash commands (the `/` menu)

Skills and slash commands are **first-class routing targets**, not just MCP/CLI
tools. The SessionStart inventory lists available skills and commands (user +
project + plugin scope). When one is purpose-built for the task — e.g.
`/deep-research`, `/security-review`, `/code-review`, design or content skills —
the orchestrator **prefers it over native tools** and **names it for the main
session to invoke** (the orchestrator subagent itself holds only Read/Grep/Glob/
Bash, so it routes rather than executing the skill). Gates still apply.

### Auto-detect connected MCPs

The SessionStart hook lists configured MCP servers (read from `.mcp.json`,
`~/.claude.json`, and settings) **plus** available skills, slash commands, and
subagents. In-session, MCP tools appear as `mcp__<server>__<tool>`. The
orchestrator routes a task to a mapped capability **only if it is present**, and
otherwise falls back to native tools and declares the gap. See `INTEGRATIONS.md`
for the full ecosystem map and how to wire more in.

The hook's inventory can lag or truncate — for the authoritative live set, query
the registries directly: **`ListConnectors`** (MCP connectors: `connected` +
`enabledInChat`), **`ListPlugins`** (enabled plugins), and **`ListSkills`**. The
*Remote / org capabilities* tables above were reconciled from those (claude.ai app)
registries — they are org-level, **not** the local `claude plugin` registry. Re-verify
per surface when the environment changes rather than trusting a stale list, and never
route to a capability not confirmed live in the current surface.
