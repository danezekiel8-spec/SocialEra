#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
APP_DIR="$ROOT_DIR/mobile-app"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://localhost:4100}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://localhost:5001/api/health}"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/socialera-smoke.XXXXXX")
BACKEND_LOG="$TMP_DIR/backend.log"
APP_LOG="$TMP_DIR/app.log"
BACKEND_PID=""
APP_PID=""

cleanup() {
  status=$?

  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi

  if [ $status -ne 0 ]; then
    echo "Smoke runner failed. Backend log: $BACKEND_LOG"
    echo "Smoke runner failed. App log: $APP_LOG"
  else
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup EXIT INT TERM

require_free_port() {
  port="$1"

  if lsof -ti "tcp:$port" >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop the existing process and retry."
    exit 1
  fi
}

is_url_ready() {
  url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

wait_for_url() {
  url="$1"
  label="$2"
  attempts=0

  while [ "$attempts" -lt 60 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  echo "$label did not become ready: $url"
  exit 1
}

if ! is_url_ready "$BACKEND_HEALTH_URL"; then
  require_free_port 5001
(
  cd "$BACKEND_DIR"
  HOST=127.0.0.1 npm start
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
  wait_for_url "$BACKEND_HEALTH_URL" "Backend"
fi

if ! is_url_ready "$SMOKE_BASE_URL"; then
  require_free_port 4100
(
  cd "$APP_DIR"
  HOST=127.0.0.1 npm start
) >"$APP_LOG" 2>&1 &
APP_PID=$!
  wait_for_url "$SMOKE_BASE_URL" "App"
fi

cd "$ROOT_DIR"
SMOKE_BASE_URL="$SMOKE_BASE_URL" npm run test:smoke
