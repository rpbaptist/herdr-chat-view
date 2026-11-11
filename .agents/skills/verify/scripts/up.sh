#!/usr/bin/env bash
# Start an isolated verification instance of herdr-chat-view.
#   up.sh [checkout-dir]       (default: the repo that holds this skill)
# Prints the run directory on the last line: READY <run-dir>
# The run directory holds run.env and all evidence. down.sh keeps it.
set -euo pipefail

skill=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
checkout=$(cd "${1:-$skill/../../..}" && pwd)
[[ -f $checkout/herdr-chat.ts ]] || { echo "no herdr-chat.ts in $checkout" >&2; exit 1; }
for bin in herdr bun jq; do command -v "$bin" >/dev/null || { echo "missing: $bin" >&2; exit 1; }; done

run=verify-chat-$(date +%Y%m%d-%H%M%S)-$RANDOM
dir=${XDG_STATE_HOME:-$HOME/.local/state}/herdr-chat-verify/$run
mkdir -p "$dir"
sock=$HOME/.config/herdr/sessions/$run/herdr.sock
sid=$(cat /proc/sys/kernel/random/uuid)
tdir=$HOME/.claude/projects/-herdr-chat-verify-$run
transcript=$tdir/$sid.jsonl

# Write run.env first, so down.sh can clean up a half-started run.
cat >"$dir/run.env" <<EOF
RUN=$run
RUN_DIR=$dir
CHECKOUT=$checkout
SKILL=$skill
HERDR_SOCKET_PATH=$sock
SESSION_ID=$sid
TRANSCRIPT_DIR=$tdir
TRANSCRIPT=$transcript
EOF
add() { echo "$1=$2" >>"$dir/run.env"; }

fail() { echo "up failed: $*" >&2; echo "clean up with: $skill/scripts/down.sh $dir" >&2; exit 1; }

# 1. A named headless herdr session. Drop the caller's herdr env, so nothing
#    inherits the live session's socket or pane.
env -u HERDR_SOCKET_PATH -u HERDR_PANE_ID -u HERDR_TAB_ID -u HERDR_WORKSPACE_ID -u HERDR_SESSION -u HERDR_ENV \
  setsid -f herdr --session "$run" server >"$dir/herdr-server.out" 2>&1 </dev/null
export HERDR_SOCKET_PATH=$sock
unset HERDR_PANE_ID HERDR_TAB_ID HERDR_WORKSPACE_ID
for _ in $(seq 50); do herdr pane list >/dev/null 2>&1 && break; sleep 0.2; done
herdr pane list >/dev/null 2>&1 || fail "herdr session $run did not start"

# 2. A workspace whose root pane runs the fixture agent.
pane=$(herdr workspace create --cwd "$checkout" --label verify --no-focus | jq -r .result.root_pane.pane_id)
[[ -n $pane && $pane != null ]] || fail "workspace create returned no pane"
add AGENT_PANE "$pane"
mkdir -p "$tdir"
cp "$skill/fixtures/seed.jsonl" "$transcript"
# herdr identifies the agent from argv[0]; detection to idle takes a few seconds.
herdr pane run "$pane" "exec -a claude bun '$skill/scripts/fixture-agent.ts' '$transcript' '$sid'" >/dev/null
want="claude idle $sid"
agent_line() { herdr agent get "$pane" 2>/dev/null | jq -r '.result.agent | "\(.agent) \(.agent_status) \(.agent_session.value)"'; }
for _ in $(seq 100); do [[ $(agent_line) == "$want" ]] && break; sleep 0.2; done
[[ $(agent_line) == "$want" ]] || fail "fixture agent in $pane is '$(agent_line)', want '$want'"

# 3. The real toggle action from this checkout: starts the chat server and opens the chat pane.
HERDR_PANE_ID=$pane bun "$checkout/herdr-chat.ts" toggle >"$dir/toggle.out" 2>&1 || fail "toggle: $(cat "$dir/toggle.out")"
key=$(bun -e 'console.log(Bun.hash(process.env.HERDR_SOCKET_PATH).toString(36))')
state=${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/herdr-chat/$key
add STATE_DIR "$state"
chat=$(jq -r --arg p "$pane" '.[$p] // empty' "$state/panes.json" 2>/dev/null || true)
[[ -n $chat ]] || fail "toggle did not record a chat pane"
add CHAT_PANE "$chat"
port=$(jq -r .port "$state/server.json"); token=$(jq -r .token "$state/server.json"); pid=$(jq -r .pid "$state/server.json")
add SERVER_PID "$pid"
add BASE "http://127.0.0.1:$port"
add TOKEN "$token"
add URL "http://127.0.0.1:$port/?t=$token#$(jq -rn --arg p "$pane" '$p|@uri')"
curl -fsS "http://127.0.0.1:$port/health?t=$token" >/dev/null || fail "chat server not healthy"

echo "READY $dir"
