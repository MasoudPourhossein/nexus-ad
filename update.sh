#!/usr/bin/env bash
# Update Nexus Ad to the latest version: pull code, rebuild dashboard, recreate containers.
set -euo pipefail
GREEN='\033[1;32m'; BLUE='\033[1;34m'; NC='\033[0m'
DIR="${NEXUS_DIR:-/opt/nexus-ad}"
cd "$DIR"
echo -e "${BLUE}==>${NC} Pulling latest code..."
git pull --ff-only
cd "$DIR"
echo -e "${BLUE}==>${NC} Rebuilding dashboard..."
if command -v npm >/dev/null; then (cd web && npm install -q && npm run build); \
else docker run --rm -v "$PWD/web":/w -w /w node:22-slim sh -c "npm install -q && npm run build"; fi
echo -e "${BLUE}==>${NC} Rebuilding and restarting containers (data is preserved)..."
docker compose pull
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo -e "${GREEN}✓${NC} Nexus Ad updated. Migrations run automatically on start."
