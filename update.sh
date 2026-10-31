#!/usr/bin/env bash
# Update Nexus Ad: pull pre-built code and recreate containers (data preserved).
set -euo pipefail
DIR="${NEXUS_DIR:-/opt/nexus-ad}"
cd "$DIR"
echo "==> Pulling latest..."
git pull --ff-only
echo "==> Restarting with the new code (no builds; data is preserved)..."
docker compose up -d --build --force-recreate nexus
docker compose up -d
docker image prune -f >/dev/null 2>&1 || true
echo "✓ Nexus Ad updated. Migrations run automatically on start."
