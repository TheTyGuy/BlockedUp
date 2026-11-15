#!/usr/bin/env bash
# Starts the Firebase Realtime Database emulator directly (no firebase CLI
# needed at runtime) and loads database.rules.json into it.
#
#   scripts/db-emulator.sh start   # background; waits until ready
#   scripts/db-emulator.sh stop
#
# The emulator jar is downloaded once by:  npx firebase setup:emulators:database
set -euo pipefail
PORT=9000
NS=demo-blockedup
PIDFILE="${TMPDIR:-/tmp}/blockedup-db-emulator.pid"
JAR=$(ls "$HOME"/.cache/firebase/emulators/firebase-database-emulator-*.jar 2>/dev/null | sort | tail -1 || true)

case "${1:-start}" in
  start)
    [ -n "$JAR" ] || { echo "Emulator jar not found. Run: npx firebase setup:emulators:database" >&2; exit 1; }
    java -Duser.language=en -jar "$JAR" --host 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 60); do
      curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:$PORT/.json?ns=$NS" && break
      sleep 0.5
    done
    curl -s --noproxy '*' -X PUT -H 'Authorization: Bearer owner' \
      --data-binary @database.rules.json \
      "http://127.0.0.1:$PORT/.settings/rules.json?ns=$NS"
    echo
    ;;
  stop)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    ;;
esac
