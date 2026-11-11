#!/usr/bin/env bash
# Read-only check: is this verification instance worth driving?
#   doctor.sh <run-dir>
# Exit 0 when every check passes. Prints one line per check.
set -uo pipefail
dir=${1:?usage: doctor.sh <run-dir>}
# shellcheck disable=SC1091
source "$dir/run.env" || exit 1
export HERDR_SOCKET_PATH
unset HERDR_PANE_ID
bad=0
check() { if eval "$2" >/dev/null 2>&1; then echo "ok   $1"; else echo "FAIL $1"; bad=1; fi; }

check "herdr session $RUN answers" "herdr pane list"
check "agent pane $AGENT_PANE is claude with session $SESSION_ID" \
  "[[ \$(herdr agent get '$AGENT_PANE' | jq -r '.result.agent.agent + \" \" + .result.agent.agent_session.value') == 'claude $SESSION_ID' ]]"
check "chat pane $CHAT_PANE exists" "herdr pane get '$CHAT_PANE'"
check "transcript exists" "[[ -f '$TRANSCRIPT' ]]"
check "server pid $SERVER_PID runs $CHECKOUT/herdr-chat.ts serve" \
  "tr '\\0' ' ' </proc/$SERVER_PID/cmdline | grep -qF '$CHECKOUT/herdr-chat.ts serve'"
check "server state dir belongs to this run" "[[ \$(jq -r .pid '$STATE_DIR/server.json') == '$SERVER_PID' ]]"
check "chat server /health" "curl -fsS '$BASE/health?t=$TOKEN'"
check "served page equals $CHECKOUT/index.html" "cmp -s <(curl -fsS '$BASE/?t=$TOKEN') '$CHECKOUT/index.html'"
exit $bad
