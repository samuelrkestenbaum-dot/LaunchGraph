#!/usr/bin/env bash
# Atomic per-EVENT guard for hooks registered at BOTH user and project scope.
#
# Problem: for one event Claude fires the hook once per registered scope (global +
# project). The two duplicate invocations of ONE event must emit once, but a LATER
# event in the same session must emit again.
#
# Claude's live UserPromptSubmit payload often has NO prompt_id, so a session-only key
# would suppress every prompt after the first (the P-011 bug). The robust event-instance
# key is the payload's own content hash: identical across the two duplicate invocations
# of one event (Claude passes them the same stdin) but different for the next event.
# prompt_id is used directly when the payload does carry one. No dependency on prompt_id.

build_os_hook_once() {
  local event="${1:?event required}" payload fields session_id prompt_id phash instance key base
  payload="$(cat 2>/dev/null || true)"
  [ -n "$payload" ] || return 0   # no payload → fail open (emit)

  fields="$(
    printf '%s' "$payload" | python3 -c '
import hashlib, json, sys
raw = sys.stdin.buffer.read()
try:
    data = json.loads(raw.decode("utf-8", "replace"))
except Exception:
    data = {}
if not isinstance(data, dict):
    data = {}
print(data.get("session_id", ""))
print(data.get("prompt_id", ""))
print(hashlib.sha256(raw).hexdigest())
' 2>/dev/null
  )"
  session_id="$(printf '%s\n' "$fields" | sed -n '1p')"
  prompt_id="$(printf '%s\n' "$fields" | sed -n '2p')"
  phash="$(printf '%s\n' "$fields" | sed -n '3p')"
  [ -n "$session_id" ] || return 0   # unidentifiable session → fail open

  # Robust event instance: prompt_id when present, else the payload content hash.
  instance="$prompt_id"
  [ -n "$instance" ] || instance="$phash"
  [ -n "$instance" ] || return 0     # cannot form an instance key → fail open

  key="${event}-${session_id}-${instance}"
  key="$(printf '%s' "$key" | tr -cd 'A-Za-z0-9._-')"
  [ -n "$key" ] || return 0

  base="${TMPDIR:-/tmp}/build-os-hook-once"
  mkdir -p "$base"
  mkdir "$base/$key" 2>/dev/null   # first time → 0 (emit); duplicate → non-zero (suppress)
}
