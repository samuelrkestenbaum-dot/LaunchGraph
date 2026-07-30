#!/usr/bin/env bash
# Build OS — skill-budget audit (P-011, corrected P-016).
#
# Claude Code loads skill metadata for every ENABLED plugin at startup against a
# ~30,000-char budget. The honest question is "how big is the STARTUP-ENABLED set",
# not "how many SKILL.md files exist on disk". Counting every cache + marketplace copy
# conflates installed inventory with the startup budget and massively over-reports
# (e.g. 2,584 skills / 20M chars from duplicated cache+marketplace trees).
#
# Two modes:
#   skill-budget-audit.sh --claude-dir <CLAUDE_USER_DIR> [BUDGET]
#       Enabled-aware. Reads <dir>/settings.json (enabledPlugins) and
#       <dir>/plugins/installed_plugins.json (installPath per plugin). Reports the
#       INSTALLED inventory (de-duped by installPath) and, SEPARATELY, the
#       STARTUP-ENABLED set — and only the enabled set is checked against the budget.
#   skill-budget-audit.sh <PLUGINS_DIR> [BUDGET]
#       Legacy installed-inventory scan of a plugins root (de-dupes cache/marketplace
#       copies of the same skill). Any over-budget note is labelled "installed
#       inventory", NOT a startup-budget verdict.
#
# Read-only. Portable (python3 only). Default budget 30000.
set -uo pipefail

MODE="legacy"; TARGET=""; BUDGET="30000"
if [ "${1:-}" = "--claude-dir" ]; then
  MODE="enabled"; TARGET="${2:-$HOME/.claude}"; BUDGET="${3:-30000}"
else
  TARGET="${1:-$HOME/.claude/plugins}"; BUDGET="${2:-30000}"
fi

if [ ! -d "$TARGET" ]; then
  echo "skill-budget-audit: no directory at $TARGET (nothing to audit)"
  exit 0
fi

python3 - "$MODE" "$TARGET" "$BUDGET" <<'PY'
import json, os, sys

mode, target, budget = sys.argv[1], sys.argv[2], int(sys.argv[3])

def count_skills(path):
    """Return (skill_count, approx_chars) for every SKILL.md under path."""
    n = c = 0
    if not path or not os.path.isdir(path):
        return 0, 0
    for dirpath, _dirs, files in os.walk(path):
        if "SKILL.md" in files:
            n += 1
            try:
                c += os.path.getsize(os.path.join(dirpath, "SKILL.md"))
            except OSError:
                pass
    return n, c

def truthy(v):
    return v not in (False, None, 0, "", [], {})

if mode == "enabled":
    settings_path = os.path.join(target, "settings.json")
    installed_path = os.path.join(target, "plugins", "installed_plugins.json")
    try:
        settings = json.load(open(settings_path))
    except Exception:
        settings = {}
    try:
        installed_raw = json.load(open(installed_path))
    except Exception:
        installed_raw = {}
    enabled = settings.get("enabledPlugins", {}) if isinstance(settings, dict) else {}

    # installed_plugins.json may be {"plugins": {...}} or a flat {name: ...} map.
    plugins = installed_raw.get("plugins", installed_raw) if isinstance(installed_raw, dict) else {}

    def choose_install_path(meta):
        # A plugin entry may be: a LIST of install records [{scope,user,installPath,...}]
        # (the real host schema), a single dict with installPath, or a bare path string.
        # Prefer the current-user record, then any record whose installPath exists on disk,
        # then the last record with any installPath (latest wins). One path per plugin.
        if isinstance(meta, str):
            return meta
        records = []
        if isinstance(meta, dict):
            records = [meta]
        elif isinstance(meta, list):
            records = [r for r in meta if isinstance(r, dict)]
        def path_of(r):
            p = r.get("installPath")
            return p if isinstance(p, str) and p else None
        # 1) a user-scope record with a real directory
        for r in records:
            if str(r.get("scope", "")).lower() == "user" and path_of(r) and os.path.isdir(path_of(r)):
                return path_of(r)
        # 2) any record with a real directory
        for r in records:
            if path_of(r) and os.path.isdir(path_of(r)):
                return path_of(r)
        # 3) fall back to the last record that names an installPath (even if missing)
        chosen = None
        for r in records:
            if path_of(r):
                chosen = path_of(r)
        return chosen

    def is_enabled(name):
        # Match "name@market" or bare "name" against enabledPlugins keys.
        base = name.split("@", 1)[0]
        for key, val in (enabled.items() if isinstance(enabled, dict) else []):
            if key == name or key.split("@", 1)[0] == base:
                return truthy(val)
        return False

    inst_skills = inst_chars = 0
    en_skills = en_chars = 0
    inst_plugins = en_plugins = 0
    seen_paths = set()
    en_rows, disabled_rows = [], []
    for name, meta in (plugins.items() if isinstance(plugins, dict) else []):
        ipath = choose_install_path(meta)           # handles list + dict + string schemas
        if not ipath or ipath in seen_paths:
            continue
        seen_paths.add(ipath)                       # de-dupe: one installPath == one plugin
        n, c = count_skills(ipath)
        inst_skills += n; inst_chars += c; inst_plugins += 1
        if is_enabled(name):
            en_skills += n; en_chars += c; en_plugins += 1
            en_rows.append((name, n, c))
        else:
            disabled_rows.append((name, n, c))

    print("Skill-budget audit (enabled-aware): %s" % target)
    print("  installed inventory: %d skills across %d plugins  (~%d chars)  [on disk; NOT all load at startup]"
          % (inst_skills, inst_plugins, inst_chars))
    print("  startup-enabled: %d skills across %d plugins  (~%d full-body inventory chars)  configured metadata budget: %d"
          % (en_skills, en_plugins, en_chars, budget))
    print("  startup metadata status: UNKNOWN from files alone (full SKILL.md bodies are inventory, not measured startup metadata)")
    if en_rows:
        print("  enabled dominators (trim these first):")
        for name, n, c in sorted(en_rows, key=lambda r: r[1], reverse=True)[:15]:
            print("    %-40s %5d skills  %8d chars" % (name, n, c))
    if disabled_rows:
        print("  installed-but-not-startup (not counted against the budget):")
        for name, n, c in sorted(disabled_rows, key=lambda r: r[1], reverse=True)[:15]:
            print("    %-40s %5d skills  %8d chars" % (name, n, c))
    raise SystemExit(0)

# ── legacy installed-inventory mode ───────────────────────────────────────────
# De-dupe cache vs marketplace copies of the same skill so an installed inventory is
# not double-counted. Key = (marketplace, plugin, skill-dir) when the path lives under
# cache/ or marketplaces/; otherwise the relative dir (unique) so bare fixtures count
# every skill exactly once.
per = {}
total_skills = total_chars = 0
seen_keys = set()
for dirpath, _dirs, files in os.walk(target):
    if "SKILL.md" not in files:
        continue
    rel = os.path.relpath(dirpath, target)
    parts = rel.split(os.sep)
    top = parts[0] if rel != "." else "(root)"
    if parts and parts[0] in ("cache", "marketplaces") and len(parts) >= 3:
        market = parts[1]; plugin = parts[2]
        skill = parts[-1]
        top = plugin
        key = (market, plugin, skill)
    else:
        key = ("_", rel)
    if key in seen_keys:
        continue                      # duplicate cache/marketplace copy -> count once
    seen_keys.add(key)
    try:
        size = os.path.getsize(os.path.join(dirpath, "SKILL.md"))
    except OSError:
        size = 0
    row = per.setdefault(top, [0, 0]); row[0] += 1; row[1] += size
    total_skills += 1; total_chars += size

print("Skill-budget audit (installed inventory): %s" % target)
print("  total skills: %d   approx SKILL.md chars: %d   budget: %d" % (total_skills, total_chars, budget))
print("  status: %s  (installed inventory — not a startup-enabled verdict)"
      % ("OVER BUDGET" if total_chars > budget else "within budget"))
print("  dominators (skills, approx chars) — trim these first:")
for top, (n, ch) in sorted(per.items(), key=lambda kv: kv[1][0], reverse=True)[:15]:
    print("    %-40s %5d skills  %8d chars" % (top, n, ch))
PY
