#!/bin/bash
# Deploy MCEngine to a remote server via SSH/rsync.
# First-time setup: also runs install, seed, and starts PM2.
#
# Usage:
#   ./scripts/deploy.sh user@yourserver.com [/opt/mcengine]
#
# Prerequisites on remote:
#   - Node.js 18+
#   - npm
#   - PM2:  npm install -g pm2

set -e

REMOTE="${1:?Usage: ./scripts/deploy.sh user@host [remote_path]}"
REMOTE_PATH="${2:-/opt/mcengine}"
LOCAL_ENGINE="../Magic Cat Engine/magiccatengine.html"

echo "==> Syncing files to $REMOTE:$REMOTE_PATH"
rsync -az --exclude 'node_modules' --exclude 'data' --exclude '.env' --exclude 'logs' \
  ./ "$REMOTE:$REMOTE_PATH/"

echo "==> Installing dependencies"
ssh "$REMOTE" "cd $REMOTE_PATH && npm install --omit=dev"

echo "==> Ensuring .env exists (won't overwrite existing)"
ssh "$REMOTE" "cd $REMOTE_PATH && [ -f .env ] || cp .env.example .env && echo 'Created .env — edit ADMIN_KEY before going live'"

echo "==> Seeding engine (skips if already seeded)"
ssh "$REMOTE" "cd $REMOTE_PATH && node scripts/seed-engine.js $REMOTE_PATH/../magiccatengine.html 2>/dev/null || echo 'Seed skipped (engine already in DB or file missing — upload manually)'"

echo "==> Starting/reloading PM2"
ssh "$REMOTE" "cd $REMOTE_PATH && pm2 start ecosystem.config.js --update-env 2>/dev/null || pm2 reload mcengine"
ssh "$REMOTE" "pm2 save"

echo ""
echo "Deployed. Visit http://$REMOTE:3000"
echo "Set up Nginx + certbot for HTTPS — see nginx.conf.example"
