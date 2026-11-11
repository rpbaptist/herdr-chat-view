#!/usr/bin/env bash
# A stand-in for voxtype in verify runs: no microphone, no model.
# up.sh copies it to <run-dir>/voxtype/voxtype. State, calls and the text are in
# that directory: calls.log (one line per call), state, text (the dictated
# text), fail (when present, each record command fails with its content).
set -euo pipefail
d=${FAKE_VOXTYPE_DIR:?}
echo "$*" >>"$d/calls.log"
state() { cat "$d/state" 2>/dev/null || echo idle; }
if [[ ${1:-} == record && -f $d/fail ]]; then cat "$d/fail" >&2; exit 1; fi
case "${1:-} ${2:-}" in
  "status "*) state ;;
  "record start") echo "${3#--file=}" >"$d/file"; echo recording >"$d/state" ;;
  "record stop")
    echo transcribing >"$d/state"
    (
      sleep "${FAKE_VOXTYPE_DELAY:-2}"
      [[ $(state) == transcribing ]] || exit 0
      f=$(cat "$d/file"); text=$(cat "$d/text" 2>/dev/null || echo "dictated text")
      printf '%s\n' "$text" >"$f"
      printf '{"status":"ok","chars":%d}' "${#text}" >"$f.done"
      echo idle >"$d/state"
    ) </dev/null >/dev/null 2>&1 &
    ;;
  "record cancel") echo idle >"$d/state" ;;
  *) echo "fake voxtype: unknown command $*" >&2; exit 2 ;;
esac
