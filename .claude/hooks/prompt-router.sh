#!/usr/bin/env bash
# Build OS — UserPromptSubmit hook: per-event dedupe + zero-touch specialist detection
# + one-line routing reminder.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD="$(cat 2>/dev/null || true)"

# shellcheck source=hook-once.sh
source "$HOOK_DIR/hook-once.sh"
printf '%s' "$PAYLOAD" | build_os_hook_once "UserPromptSubmit" || exit 0

# Zero-touch specialist orchestration (P-014): inspect the prompt and, ONLY when a
# disabled specialist (ECC / zeroization) is required, hand off to a fresh child session
# automatically. Focused tasks incur no relaunch. Recursion-guarded. Never fatal to the hook.
if [ -z "${BUILD_OS_SPECIALIST_HANDOFF:-}" ] && command -v python3 >/dev/null 2>&1; then
  HANDOFF=""
  for c in "$HOOK_DIR/../../build-os/tools/specialist-handoff.sh" \
           "${CLAUDE_PROJECT_DIR:-}/build-os/tools/specialist-handoff.sh" \
           "$HOME/build-os/tools/specialist-handoff.sh"; do
    [ -n "$c" ] && [ -x "$c" ] && { HANDOFF="$c"; break; }
  done
  if [ -n "$HANDOFF" ]; then
    PROMPT="$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
print(d.get("prompt","") if isinstance(d,dict) else "")' 2>/dev/null)"
    CWD="$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
print(d.get("cwd","") if isinstance(d,dict) else "")' 2>/dev/null)"
    if [ -n "$PROMPT" ]; then
      route="$(bash "$HANDOFF" classify "$PROMPT" 2>/dev/null || echo focused)"
      if [ "$route" != "focused" ]; then
        bash "$HANDOFF" detect "$PROMPT" "${CWD:-$PWD}" 2>&1
        handoff_ec=$?
        case "$route" in
          ecc|zeroize)
            if [ "$handoff_ec" -eq 0 ]; then
              echo "[specialist-handoff] A specialist child session (route=$route) explicitly completed this task above; report its result to the user and do not redo the task in focused mode."
            else
              echo "[specialist-handoff] Specialist handoff was not confirmed complete (route=$route, exit=$handoff_ec). Handle the task in this focused session or ask for the missing input; do not claim the child completed it."
            fi ;;
          *)
            echo "[specialist-handoff] Inline route ($route): the REQUIRED directive above names the capability to use on THIS surface. No child session was launched and no profile was changed — carry out the task here." ;;
        esac
      fi
    fi
  fi
fi

echo "Routing reminder: classify weight + authority; read the project router or ~/build-os/memory/tool_router.md. Read-only answers and diagnosis may run direct; tiny reversible edits use builder-lite + a targeted check. Use build-orchestrator for architecture/planning, substantive builds, ambiguous scope, or gates. Declare the smallest Tool Budget; STOP at merge/deploy/secret/push boundaries."

exit 0
