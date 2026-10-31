#!/usr/bin/env bash
# Update Nexus Ad: pull pre-built code and recreate containers (data preserved).
set -euo pipefail
DIR="${NEXUS_DIR:-/opt/nexus-ad}"
cd "$DIR"
echo "==> Pulling latest..."
git pull --ff-only
echo "==> Recreating containers (no npm, no builds; data is preserved)..."
docker compose pull --ignore-buildable 2>/dev/null || docker compose pull || true
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo "✓ Nexus Ad updated. Migrations run automatically on start."
