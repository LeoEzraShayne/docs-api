#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-4110}"
LOG_FILE="${LOG_FILE:-/tmp/docs-api-prod-smoke.log}"

cd "$ROOT_DIR"

npm run build

NODE_ENV=production PORT="$PORT" node dist/src/main >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 3
curl -fsS "http://127.0.0.1:${PORT}/"
echo
echo "Production smoke test passed on port ${PORT}."
