#!/bin/bash
# Push a new engine HTML to the live server via the API.
# Usage: ./scripts/update-engine-remote.sh [path/to/magiccatengine.html]
#
# Requires:
#   SERVER_URL  — e.g. https://yourdomain.com
#   ADMIN_KEY   — your admin key (set in server .env)
#
# Set these in your shell or pass inline:
#   SERVER_URL=https://yourdomain.com ADMIN_KEY=yourkey ./scripts/update-engine-remote.sh

ENGINE="${1:-../../Magic Cat Engine/magiccatengine.html}"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
ADMIN_KEY="${ADMIN_KEY:-changeme}"
VERSION="$(date +%Y-%m-%d)-$(node -e 'console.log(Date.now().toString(36))')"

if [ ! -f "$ENGINE" ]; then
  echo "Engine file not found: $ENGINE"
  exit 1
fi

echo "Uploading to $SERVER_URL ..."
curl -sf -X POST "$SERVER_URL/api/engine/update" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "engine=@$ENGINE" \
  -F "version=$VERSION" \
  && echo "Done — version: $VERSION" \
  || echo "Upload failed"
