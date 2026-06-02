#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/docs-api}"
APP_NAME="${APP_NAME:-docs-api}"
COMMIT_SHA="${GITHUB_SHA:-unknown}"

cd "$APP_ROOT"

if [[ ! -f ".env.production" ]]; then
  echo "Missing $APP_ROOT/.env.production"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ".env.production"
set +a

npm ci --include=dev
npx prisma generate
npx prisma migrate deploy
npm run build
npm prune --omit=dev

printf '%s\n' "$COMMIT_SHA" > DEPLOYED_COMMIT

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 delete "$APP_NAME"
fi

pm2 start npm --name "$APP_NAME" --cwd "$APP_ROOT" -- run start:prod
pm2 save

echo "Deployed $APP_NAME at $APP_ROOT"
echo "Commit: $COMMIT_SHA"
