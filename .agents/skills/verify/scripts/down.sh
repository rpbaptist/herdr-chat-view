#!/usr/bin/env bash
# Tear down one verification instance. Keeps the evidence in the run directory.
#   down.sh <run-dir>
# Stops only what up.sh started: the named herdr session (its panes, the fixture
# agent and pixel die with it), the chat server by its recorded PID, the state dir
# and the fixture transcript. The transcript is copied to the run dir first.
set -uo pipefail
dir=${1:?usage: down.sh <run-dir>}
# shellcheck disable=SC1091
source "$dir/run.env" || exit 1
[[ $RUN == verify-chat-* ]] || { echo "refusing: $RUN is not a verify session" >&2; exit 1; }

[[ -f ${TRANSCRIPT:-} ]] && cp "$TRANSCRIPT" "$dir/transcript.jsonl"
[[ -f ${STATE_DIR:-}/server.log ]] && cp "$STATE_DIR/server.log" "$dir/server.log"

if [[ -n ${SERVER_PID:-} ]] && tr '\0' ' ' </proc/"$SERVER_PID"/cmdline 2>/dev/null | grep -qF "herdr-chat.ts serve"; then
  kill "$SERVER_PID"
fi
if herdr session list 2>/dev/null | awk '{print $1}' | grep -qx "$RUN"; then
  herdr session stop "$RUN" >/dev/null 2>&1 || true
  for _ in $(seq 25); do herdr session list | grep -q "^$RUN *running" || break; sleep 0.2; done
  herdr session delete "$RUN" >/dev/null 2>&1 || true
fi
[[ -n ${STATE_DIR:-} && $STATE_DIR == */herdr-chat/* ]] && rm -rf "$STATE_DIR"
[[ -n ${TRANSCRIPT_DIR:-} && $TRANSCRIPT_DIR == */-herdr-chat-verify-verify-chat-* ]] && rm -rf "$TRANSCRIPT_DIR"

echo "down: $RUN removed; evidence kept in $dir"
ls "$dir"
