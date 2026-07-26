#!/usr/bin/env bash
# Build OS — Cloud-native long-running supervision fallback (P-021).
#
# A bounded polling supervisor: evaluate a shell CONDITION repeatedly until it first
# succeeds (exit 0) or a timeout elapses. Pure bash + sleep — it runs on ANY surface
# (Claude Cloud, CCR, Mac) with NO plugin, so it is the availability-aware fallback for the
# `claude-watch` route when the Claude Watch plugin is not registered on this surface.
#
# Scope: this covers the IN-TURN bounded watch. For cross-turn / overnight supervision,
# pair it with the session's scheduling primitive (send_later / a scheduled re-check),
# which the router names alongside this tool. Output is bounded (one line per poll).
#
# Usage:
#   supervise.sh --until "<shell condition>" [--interval SEC] [--timeout SEC] [--label TEXT]
# Result:
#   exit 0   + "SUPERVISE_STATUS: COMPLETED"  when the condition first succeeds
#   exit 124 + "SUPERVISE_STATUS: TIMEOUT"    when the timeout elapses first
#   exit 2   + "SUPERVISE_STATUS: USAGE"      on missing/invalid arguments
set -uo pipefail

COND=""; INTERVAL="5"; TIMEOUT="900"; LABEL="task"
while [ $# -gt 0 ]; do
  case "$1" in
    --until)    COND="${2:-}"; shift 2 ;;
    --interval) INTERVAL="${2:-5}"; shift 2 ;;
    --timeout)  TIMEOUT="${2:-900}"; shift 2 ;;
    --label)    LABEL="${2:-task}"; shift 2 ;;
    -h|--help)  echo "Usage: $0 --until \"<shell condition>\" [--interval SEC] [--timeout SEC] [--label TEXT]"; exit 0 ;;
    *)          shift ;;
  esac
done

if [ -z "$COND" ]; then
  echo "SUPERVISE_STATUS: USAGE — --until \"<shell condition>\" is required." >&2
  exit 2
fi

waited=0; checks=0
while :; do
  checks=$((checks + 1))
  if bash -c "$COND" >/dev/null 2>&1; then
    echo "[supervise] $LABEL: condition met after $checks check(s), ${waited}s elapsed."
    echo "SUPERVISE_STATUS: COMPLETED"
    exit 0
  fi
  if [ "$waited" -ge "$TIMEOUT" ]; then
    echo "[supervise] $LABEL: condition NOT met within ${TIMEOUT}s ($checks checks)." >&2
    echo "SUPERVISE_STATUS: TIMEOUT"
    exit 124
  fi
  echo "[supervise] $LABEL: check $checks pending (waited ${waited}s / ${TIMEOUT}s)..."
  sleep "$INTERVAL"
  waited=$((waited + INTERVAL))
done
