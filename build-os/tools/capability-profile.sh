#!/usr/bin/env bash
# Switch Claude Code between the fast default and explicit specialist sessions.
set -euo pipefail

PROFILE="${1:-status}"
CLAUDE_DIR="${CLAUDE_USER_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"
CONFIG="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"

case "$PROFILE" in
  focused|ecc|zeroize|status) ;;
  *)
    echo "Usage: $0 {focused|ecc|zeroize|status}" >&2
    exit 2
    ;;
esac

python3 - "$PROFILE" "$SETTINGS" "$CONFIG" <<'PY'
import json
from pathlib import Path
import sys

profile, settings_name, config_name = sys.argv[1:]
settings_path, config_path = Path(settings_name), Path(config_name)

def load(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}

settings, config = load(settings_path), load(config_path)
enabled = settings.setdefault("enabledPlugins", {})
servers = config.setdefault("mcpServers", {})

if profile == "status":
    print("Capability profile state:")
    print("  ECC:", "enabled" if enabled.get("ecc@ecc") else "disabled")
    print("  zeroize-audit:", "enabled" if enabled.get("zeroize-audit@trailofbits") else "disabled")
    print("  pinned user Serena:", "enabled" if "serena" in servers else "disabled")
    print("  skill budget fraction:", settings.get("skillListingBudgetFraction", "default"))
    raise SystemExit(0)

enabled["ecc@ecc"] = profile == "ecc"
enabled["zeroize-audit@trailofbits"] = profile == "zeroize"
settings["skillListingBudgetFraction"] = 0.40 if profile == "ecc" else 0.18

if profile == "zeroize":
    # zeroize-audit supplies its own Serena. Remove the user copy to keep one server.
    servers.pop("serena", None)
else:
    servers["serena"] = {
        "type": "stdio",
        "command": "uvx",
        "args": [
            "--from",
            "git+https://github.com/oraios/serena@68884f1190489685082dc3c3b56917e92a1de0e6",
            "serena",
            "start-mcp-server",
            "--context",
            "claude-code",
            "--project-from-cwd",
        ],
        "env": {},
    }

settings_path.parent.mkdir(parents=True, exist_ok=True)
config_path.parent.mkdir(parents=True, exist_ok=True)
settings_path.write_text(json.dumps(settings, indent=2) + "\n")
config_path.write_text(json.dumps(config, indent=2) + "\n")

print("Capability profile:", profile)
if profile == "focused":
    print("  Fast default: focused stack + pinned Serena")
elif profile == "ecc":
    print("  ECC specialist: all ECC skills/agents + pinned Serena")
else:
    print("  Zeroization specialist: zeroize-audit + plugin Serena")
print("Restart Claude Code to load the profile.")
PY
