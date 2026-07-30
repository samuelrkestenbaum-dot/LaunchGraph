#!/usr/bin/env bash
# Build OS — zero-touch specialist orchestration (P-014, hardened P-016).
#
# Inspects a build request and routes it deterministically:
#   • focused                              -> no relaunch (the common case).
#   • ecc / zeroize (disabled profiles)    -> bounded child handoff:
#       (1) preserve the exact original task + working directory,
#       (2) activate ONLY the required profile (under a global lock),
#       (3) launch a fresh non-interactive Claude Code child session with that task,
#       (4) wait for + surface its result and exit status (never silently "succeed"),
#       (5) restore focused mode afterward — even on failure, timeout, or interruption.
#   • 21st / agent-reach / claude-watch / ui-ux-pro-max  -> INLINE current-surface
#       routes: emit a strong REQUIRED directive; NO profile switch, NO child.
#
# Guards: recursion (BUILD_OS_SPECIALIST_HANDOFF env), one profile at a time (ECC and
# zeroize are mutually exclusive by construction and by lock), one Serena
# (capability-profile.sh), a portable atomic lock (fail-closed BUSY on contention), a
# hard timeout, and a PRIVACY-SAFE audit log (route/result/exit/event-id only — never
# the prompt text or cwd).
#
# Subcommands:
#   classify "<prompt>"          -> print route: focused|ecc|zeroize|21st|agent-reach|
#                                   claude-watch|ui-ux-pro-max
#   detect   "<prompt>" [cwd]    -> auto: focused no-op; ecc/zeroize handoff; inline
#                                   routes emit a REQUIRED directive (no child)
#   --dry-run|status "<prompt>"  -> classify + report the plan; NO relaunch, NO switch
#
# Env overrides (tests + host): CLAUDE_BIN (default claude), CAPABILITY_PROFILE_BIN
# (default sibling capability-profile.sh), HANDOFF_TIMEOUT (default 900s), HANDOFF_LOG
# (default ~/.claude/build-os-handoffs.log), HANDOFF_LOCK (default
# ~/.claude/build-os-handoff.lock), HANDOFF_LOCK_WAIT (default 30s), HANDOFF_LOCK_STALE
# (default 1800s), CLAUDE_USER_DIR / CLAUDE_CONFIG_PATH (passed through to the profile
# switcher), BUILD_OS_SPECIALIST_HANDOFF (recursion guard).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
CAPABILITY_PROFILE_BIN="${CAPABILITY_PROFILE_BIN:-$HERE/capability-profile.sh}"
HANDOFF_TIMEOUT="${HANDOFF_TIMEOUT:-900}"
HANDOFF_LOG="${HANDOFF_LOG:-$HOME/.claude/build-os-handoffs.log}"
HANDOFF_LOCK="${HANDOFF_LOCK:-$HOME/.claude/build-os-handoff.lock}"
HANDOFF_LOCK_WAIT="${HANDOFF_LOCK_WAIT:-30}"
HANDOFF_LOCK_STALE="${HANDOFF_LOCK_STALE:-1800}"
HANDOFF_OUTPUT_MAX="${HANDOFF_OUTPUT_MAX:-131072}"

# ── Capability registry ───────────────────────────────────────────────────────
# Maintainable, precedence-ordered task-family rules — NOT one opaque regex.
# classify() walks these families top-to-bottom and returns the FIRST route whose
# ERE matches the (lowercased) prompt; it falls through to "focused". Zeroize is the
# highest precedence and focused is the conservative default, so ordinary lightweight
# work (listing files, doc typos, factual questions) never triggers a relaunch. Each
# family owns its own labelled POSIX-ERE pattern (portable; no GNU-only \b). To extend
# the registry, edit one family's pattern or add a new family + a line in classify().

# 1) Zeroization / secret-hygiene audit — keep HIGHEST precedence.
CAP_ZEROIZE='zeroiz'
CAP_ZEROIZE+='|scrub[ -]?(the )?(secret|key|credential|buffer|memory|register)'
CAP_ZEROIZE+='|wipe[ -]?(the )?(secret|key|credential|password|token|buffer)'
CAP_ZEROIZE+='|(secret|api[ -]?key|credential|token|password|private key)s?.*(remain|left|linger|persist|resid|still).*(memor|ram|register|stack|heap|core|swap|process)'
CAP_ZEROIZE+='|(cleared|zeroed|zeroised|wiped|scrubbed|erased|not retained).*(memor|ram|register|stack|heap|buffer)'
CAP_ZEROIZE+='|(register|stack|memor|heap|buffer)s?.*(cleared|zeroed|zeroised|wiped|scrubbed|erased|not retained)'
CAP_ZEROIZE+='|verify.*(secret|key|credential|password).*(clear|gone|removed|erased|not.*retain)'

# 2) Everything Claude Code (ECC) specialist bundle — heavy relaunch. The existing
#    elliptic-curve tokens are RETAINED so prior behaviour is preserved, but the bundle
#    also serves broad language/framework/browser/architecture/agent specialists.
CAP_ECC='(^|[^a-z])ecc([^a-z]|$)|elliptic[ -]?curve|ecdsa|ed25519|secp256|curve25519'          # crypto (retained)
CAP_ECC+='|chrome ?devtools|devtools protocol|browser automation|headless browser|playwright|puppeteer'  # browser specialist
CAP_ECC+='|rust.*(ownership|unsafe|borrow|lifetime|trait bound|async runtime)|(ownership|unsafe|borrow[ -]?check|lifetime).*rust'  # rust specialist
CAP_ECC+='|(golang|(^|[^a-z])go([^a-z]|$)).*(concurren|goroutine|race condition|deadlock|channel|scheduler|data race)'            # go specialist
CAP_ECC+='|(concurren|goroutine|deadlock|data race).*(golang|(^|[^a-z])go([^a-z]|$))'
CAP_ECC+='|(postgres|postgresql|psql).*(schema|query|optimi|index|explain|query plan|performance|migration|tuning|vacuum|partition)'  # postgres specialist
CAP_ECC+='|(autonomous |ai |llm )?agent.*(harness|eval|evaluation|benchmark)|eval.*harness|(harness|evals?).*(agent|llm)'          # agent harness/evals
CAP_ECC+='|(system|software|service|distributed[ -]?system|micro-?service).*architect|architect(ure)?.*(review|redesign|overhaul|migration|decompos)'  # architecture specialist
CAP_ECC+='|(language|framework|compiler|kernel|systems|performance) specialist'                # explicit specialist ask

# 3-6) Inline current-surface routes — NO relaunch, NO profile switch. Kept explicit
#      so ordinary codebase work (e.g. "find the component that renders X") stays focused.
CAP_21ST='21st|shadcn|component (library|registry|catalog|marketplace|discovery)|(browse|discover|scaffold).*(design )?(ui |react )?component'
CAP_AGENT_REACH='agent[ -]?reach|external[ -]?platform'
CAP_AGENT_REACH+='|(research|look up|search|scrape|monitor).*(online|internet|the web|twitter|reddit|linkedin|xiaohongshu|xhs|bilibili|youtube|hacker news|v2ex|github (issues|discussions))'
CAP_AGENT_REACH+='|reach(ability)?.*(external|platform|api)'
CAP_CLAUDE_WATCH='claude[ -]?watch|long[ -]?running.*(supervis|monitor|watch|oversight)'
CAP_CLAUDE_WATCH+='|(supervis|monitor|watch|babysit).*(long[ -]?running|overnight|multi-?hour|background (job|run|build|process))'
CAP_UI_UX='ui[ /_-]?ux|user (interface|experience)|(ui|ux|interaction|visual) design|design system|wireframe|figma|mockup'
CAP_UI_UX+='|(landing|marketing) page (design|layout)|redesign.*(screen|page|interface|ui)|design.*(screen|page|interface|layout|dashboard)'

INLINE_ROUTES=" 21st agent-reach claude-watch ui-ux-pro-max "

classify() {
  local p; p="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  _m() { printf '%s' "$p" | grep -qE "$1"; }
  _m "$CAP_ZEROIZE"      && { echo zeroize;       return 0; }
  _m "$CAP_ECC"         && { echo ecc;           return 0; }
  _m "$CAP_21ST"        && { echo 21st;          return 0; }
  _m "$CAP_AGENT_REACH" && { echo agent-reach;   return 0; }
  _m "$CAP_CLAUDE_WATCH" && { echo claude-watch;  return 0; }
  _m "$CAP_UI_UX"       && { echo ui-ux-pro-max; return 0; }
  echo focused
}

is_inline_route() { case "$INLINE_ROUTES" in *" $1 "*) return 0;; *) return 1;; esac; }

# ── Privacy-safe audit log ────────────────────────────────────────────────────
# NEVER logs prompt text or cwd. Records only timestamp, route, result, exit code,
# and a non-reversible event id. Creates the log 0600 and tightens an existing 0644
# file to 0600 on every write. Does not read, output, or migrate old contents.
event_id() {  # opaque id from the args + a timestamp; not stored in plaintext
  local seed; seed="$(printf '%s|' "$@")$(date '+%s%N' 2>/dev/null || date '+%s' 2>/dev/null || echo t)"
  if command -v sha256sum >/dev/null 2>&1; then printf '%s' "$seed" | sha256sum | cut -c1-16
  elif command -v shasum >/dev/null 2>&1; then printf '%s' "$seed" | shasum -a 256 | cut -c1-16
  else printf '%s' "$seed" | cksum | tr -d ' ' | cut -c1-16; fi
}

log_event() {  # route status exit event   (PRIVACY: no prompt, no cwd)
  local dir; dir="$(dirname "$HANDOFF_LOG")"
  mkdir -p "$dir" 2>/dev/null || true
  [ -e "$HANDOFF_LOG" ] || ( umask 077; : > "$HANDOFF_LOG" ) 2>/dev/null || true
  chmod 600 "$HANDOFF_LOG" 2>/dev/null || true
  printf '%s\troute=%s\tresult=%s\texit=%s\tevent=%s\n' \
    "$(date '+%Y-%m-%dT%H:%M:%S%z' 2>/dev/null || echo now)" "$1" "$2" "$3" "$4" \
    >> "$HANDOFF_LOG" 2>/dev/null || true
}

# ── Portable atomic lock (mkdir is atomic on POSIX FS; no flock dependency) ────
_dir_older_than() {  # dir secs -> 0 if dir mtime older than secs
  local dir="$1" secs="$2" mins
  mins=$(( (secs + 59) / 60 ))
  [ -n "$(find "$dir" -maxdepth 0 -mmin +"$mins" 2>/dev/null)" ]
}
lock_is_stale() {
  local pidf="$HANDOFF_LOCK/pid" pid
  if [ -f "$pidf" ]; then
    pid="$(cat "$pidf" 2>/dev/null || echo)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      _dir_older_than "$HANDOFF_LOCK" "$HANDOFF_LOCK_STALE"   # holder alive: stale only if very old
      return $?
    fi
    return 0   # holder pid dead/missing -> stale
  fi
  _dir_older_than "$HANDOFF_LOCK" "$HANDOFF_LOCK_STALE"       # no pid file: stale if old
}
acquire_lock() {
  local waited=0 breaks=0
  while ! mkdir "$HANDOFF_LOCK" 2>/dev/null; do
    if lock_is_stale; then
      breaks=$((breaks + 1)); [ "$breaks" -gt 3 ] && return 1
      safe_release_lock || return 1
      continue
    fi
    [ "$waited" -ge "$HANDOFF_LOCK_WAIT" ] && return 1
    sleep 1; waited=$((waited + 1))
  done
  printf '%s\n' "$$" > "$HANDOFF_LOCK/pid" 2>/dev/null || true
  return 0
}
lock_path_safe() {
  [ -n "$HANDOFF_LOCK" ] && [ "$HANDOFF_LOCK" != "/" ] &&
    [ "$HANDOFF_LOCK" != "." ] && [ "$HANDOFF_LOCK" != ".." ] &&
    [ "$HANDOFF_LOCK" != "$HOME" ] && [ "$HANDOFF_LOCK" != "$HOME/" ]
}
safe_release_lock() {
  lock_path_safe || return 1
  [ -L "$HANDOFF_LOCK" ] && return 1
  [ -f "$HANDOFF_LOCK/pid" ] && rm -f "$HANDOFF_LOCK/pid" 2>/dev/null
  rmdir "$HANDOFF_LOCK" 2>/dev/null
}
release_lock() { safe_release_lock || true; }

# run_with_timeout SECS CMD...  -> 124 on timeout. Portable (timeout / gtimeout / perl).
run_with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"; return $?
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"; return $?
  else
    perl -e '
      my $s=shift; my $pid=fork;
      if(!defined $pid){exit 127}
      if($pid==0){ exec @ARGV; exit 127; }
      local $SIG{ALRM}=sub{ kill "TERM",$pid; sleep 1; kill "KILL",$pid; exit 124; };
      alarm $s; waitpid($pid,0); exit($? >> 8);
    ' "$secs" "$@"; return $?
  fi
}

activate_profile() { "$CAPABILITY_PROFILE_BIN" "$1" >/dev/null 2>&1; }
restore_focused()  { activate_profile focused || true; }

# ── Inline current-surface directive (no child, no profile switch) ────────────
inline_directive() {
  local route="$1" cap dir fallback
  case "$route" in
    21st)          cap="the 21st.dev component tools (mcp__21st__*)"; dir="find or scaffold UI components on the CURRENT surface"
                   fallback="hand-author the component or reuse an existing one in this repo, or report 21st.dev unavailable here" ;;
    agent-reach)   cap="the Agent Reach skill";                       dir="do external-platform reachability / web research on the CURRENT surface"
                   fallback="use built-in web search / WebFetch, or report external reachability unavailable" ;;
    claude-watch)  cap="Claude Watch";                                dir="set up long-running supervision on the CURRENT surface"
                   fallback="use the Cloud-native supervision lane — build-os/tools/supervise.sh for the in-turn bounded watch, plus the session scheduling primitive (send_later / a scheduled re-check) for cross-turn supervision" ;;
    ui-ux-pro-max) cap="UI UX Pro Max";                               dir="do the UI/UX design work on the CURRENT surface"
                   fallback="apply standard UI/UX best practices inline, or report the UI/UX specialist unavailable here" ;;
    *)             cap="the routed capability";                       dir="handle this on the CURRENT surface"
                   fallback="handle it inline or report it unavailable" ;;
  esac
  echo "[specialist-handoff] route=$route — INLINE CANDIDATE: first verify that $cap is connected and callable on this execution surface. If available, use it to $dir; if unavailable or disconnected, use the fallback (${fallback}) and state that limitation. Do NOT claim the capability is available merely because it is installed. Do NOT switch profiles or launch a child."
  log_event "$route" INLINE 0 "$(event_id "$route")"
}

# ── Bounded specialist handoff (ecc / zeroize only) ───────────────────────────
# handoff ROUTE PROMPT CWD
handoff() {
  local route="$1" prompt="$2" cwd="${3:-$PWD}" out ec eid status terminal
  local capture_dir capture_file status_file truncated_file pipeline_pid marker_count final_line
  eid="$(event_id "$route" "$prompt" "$cwd")"
  # Concurrency: acquire the global profile lock BEFORE any mutation. Fail closed —
  # BUSY means no profile change and no child, so a second handoff never races the
  # profile switch or leaves ECC/zeroize half-applied.
  if ! lock_path_safe || ! acquire_lock; then
    echo "[specialist-handoff] RESULT: BUSY (route=$route) — another specialist handoff holds the profile lock (waited ${HANDOFF_LOCK_WAIT}s). No profile change and no child launched; retry shortly or run /capability-profile $route manually." >&2
    log_event "$route" BUSY 75 "$eid"
    return 75
  fi
  # (5) ALWAYS restore focused AND release the lock — even on failure / interruption.
  capture_dir="$(mktemp -d "${TMPDIR:-/tmp}/build-os-handoff.XXXXXX")" || return 3
  chmod 700 "$capture_dir" 2>/dev/null || true
  capture_file="$capture_dir/output"; status_file="$capture_dir/status"; truncated_file="$capture_dir/truncated"
  ( umask 077; : > "$capture_file"; : > "$status_file" )
  pipeline_pid=""
  cleanup_handoff() {
    if [ -n "${pipeline_pid:-}" ] && kill -0 "$pipeline_pid" 2>/dev/null; then
      command -v pkill >/dev/null 2>&1 && pkill -TERM -P "$pipeline_pid" 2>/dev/null || true
      kill -TERM "$pipeline_pid" 2>/dev/null || true
      wait "$pipeline_pid" 2>/dev/null || true
    fi
    restore_focused; release_lock
    rm -f "$capture_file" "$status_file" "$truncated_file" 2>/dev/null || true
    rmdir "$capture_dir" 2>/dev/null || true
  }
  trap 'cleanup_handoff' EXIT
  trap 'cleanup_handoff; exit 130' INT
  trap 'cleanup_handoff; exit 143' TERM
  # (2) activate ONLY the required profile.
  if ! activate_profile "$route"; then
    echo "[specialist-handoff] ERROR: could not activate '$route' profile; staying focused." >&2
    log_event "$route" ACTIVATE_FAILED 3 "$eid"
    return 3
  fi
  echo "[specialist-handoff] route=$route — launching a fresh non-interactive Claude child (timeout ${HANDOFF_TIMEOUT}s)."
  # (3)+(4) launch the child with the exact task + bounded context, in the original cwd,
  # with the recursion guard set; capture output + exit status.
  # The task travels over stdin, never argv. The terminal marker is deliberately
  # machine-readable: a zero process exit without it is not semantic completion.
  (
    set +e
    cd "$cwd" 2>/dev/null || exit 3
    printf '%s\n\n%s\n' "$prompt" \
      'When finished, end your final response with exactly one terminal marker: [BUILD_OS_STATUS: COMPLETED], [BUILD_OS_STATUS: NEEDS_INPUT], [BUILD_OS_STATUS: BLOCKED], or [BUILD_OS_STATUS: FAILED].' |
      run_with_timeout "$HANDOFF_TIMEOUT" env "BUILD_OS_SPECIALIST_HANDOFF=$route" "$CLAUDE_BIN" -p 2>&1 |
      python3 -c 'import os,sys
p,n,flag=sys.argv[1],int(sys.argv[2]),sys.argv[3]
kept=0; truncated=False
with open(p,"wb") as f:
  while True:
    b=sys.stdin.buffer.read(65536)
    if not b: break
    room=max(0,n-kept)
    if room:
      w=b[:room]; f.write(w); kept+=len(w)
    if len(b)>room: truncated=True
if truncated: open(flag,"wb").close()' "$capture_file" "$HANDOFF_OUTPUT_MAX" "$truncated_file"
    printf '%s\n' "${PIPESTATUS[1]}" > "$status_file"
  ) &
  pipeline_pid=$!
  wait "$pipeline_pid"
  pipeline_pid=""
  ec="$(cat "$status_file" 2>/dev/null || echo 127)"
  out="$(cat "$capture_file" 2>/dev/null)"
  if [ -e "$truncated_file" ]; then
    printf '%s\n' "$out"
    echo "[specialist-handoff] OUTPUT TRUNCATED at ${HANDOFF_OUTPUT_MAX} characters."
  else
    printf '%s\n' "$out"
  fi
  marker_count="$(printf '%s\n' "$out" | grep -cE '^\[BUILD_OS_STATUS: (COMPLETED|NEEDS_INPUT|BLOCKED|FAILED)\]$' || true)"
  final_line="$(printf '%s\n' "$out" | awk 'NF { line=$0 } END { print line }')"
  terminal=""
  if [ "$marker_count" -eq 1 ] && printf '%s\n' "$final_line" |
      grep -qE '^\[BUILD_OS_STATUS: (COMPLETED|NEEDS_INPUT|BLOCKED|FAILED)\]$'; then
    terminal="$(printf '%s\n' "$final_line" | sed 's/^\[BUILD_OS_STATUS: //; s/\]$//')"
  fi
  # Never silently claim success — always report the child's exit status.
  if [ "$ec" -eq 0 ] && [ "$terminal" = "COMPLETED" ]; then
    status=COMPLETED
    echo "[specialist-handoff] RESULT: COMPLETED (route=$route, child exit=0). Focused mode restored."
  elif [ "$ec" -eq 0 ]; then
    status="${terminal:-UNCONFIRMED}"
    ec=76
    echo "[specialist-handoff] RESULT: $status (route=$route). Child did not explicitly confirm completion; focused parent must continue or obtain input." >&2
  elif [ "$ec" -eq 124 ]; then
    status=TIMEOUT
    echo "[specialist-handoff] RESULT: TIMEOUT after ${HANDOFF_TIMEOUT}s (route=$route). Child killed; focused mode restored. Re-run via /capability-profile $route if still needed." >&2
  else
    status=FAILED
    echo "[specialist-handoff] RESULT: FAILED (route=$route, child exit=$ec). Focused mode restored. Inspect the output above; re-run via /capability-profile $route if needed." >&2
  fi
  log_event "$route" "$status" "$ec" "$eid"
  return "$ec"
}

main() {
  local cmd="${1:-status}"
  case "$cmd" in
    classify) classify "${2:-}"; return 0 ;;
    --dry-run|dry-run|status)
      local route; route="$(classify "${2:-}")"
      if [ "$route" = "focused" ]; then
        echo "[specialist-handoff] dry-run: route=focused — no relaunch; the current session handles it."
      elif is_inline_route "$route"; then
        echo "[specialist-handoff] dry-run: route=$route — INLINE capability; WOULD use it on the current surface. No child, no profile switch. (no changes made)"
      else
        echo "[specialist-handoff] dry-run: route=$route — WOULD hand off to a fresh '$route' child, then restore focused. (no changes made)"
      fi
      return 0 ;;
    detect)
      local prompt="${2:-}" cwd="${3:-$PWD}" route
      # Recursion guard: if we are already inside a specialist child, never hand off again.
      [ -n "${BUILD_OS_SPECIALIST_HANDOFF:-}" ] && return 0
      route="$(classify "$prompt")"
      [ "$route" = "focused" ] && return 0     # focused: no relaunch
      if is_inline_route "$route"; then
        inline_directive "$route"; return 0    # inline: directive only, no child/profile switch
      fi
      handoff "$route" "$prompt" "$cwd"; return $? ;;   # ecc / zeroize
    *)
      echo "Usage: $0 {classify|detect|--dry-run|status} \"<prompt>\" [cwd]" >&2
      return 2 ;;
  esac
}

main "$@"
