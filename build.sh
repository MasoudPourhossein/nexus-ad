#!/usr/bin/env bash
# Maintainer script: build the server bundle and the dashboard, then commit them.
# Servers only ever run pre-built artifacts, so they never need npm access.
set -euo pipefail
cd "$(dirname "$0")"
echo "==> server bundle"
( cd server && npm install --no-audit --no-fund >/dev/null && npx tsc -p tsconfig.json --noEmit \
  && npx esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/index.js --log-level=warning \
     --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url); import { fileURLToPath as __fup } from 'url'; import { dirname as __dn } from 'path'; const __filename = __fup(import.meta.url); const __dirname = __dn(__filename);" )
echo "==> dashboard"
( cd web && npm install --no-audit --no-fund >/dev/null && npm run build >/dev/null )
echo "==> done: server/dist/index.js ($(du -h server/dist/index.js | cut -f1)), web/dist"
