#!/bin/sh
# Make sure an Xray binary is available, then start the API.
# Order: user-provided binary in the data volume → already installed → download from mirrors.
set -u
BIN=/usr/local/bin/xray
if [ -x /data/xray/xray ]; then cp /data/xray/xray "$BIN" && chmod +x "$BIN"; fi
if ! [ -x "$BIN" ]; then
  ARCH=$(dpkg --print-architecture 2>/dev/null | sed 's/amd64/64/;s/arm64/arm64-v8a/')
  FILE="Xray-linux-${ARCH}.zip"
  for base in \
    "${XRAY_DOWNLOAD_BASE:-}" \
    "https://github.com/XTLS/Xray-core/releases/latest/download" \
    "https://ghproxy.net/https://github.com/XTLS/Xray-core/releases/latest/download" \
    "https://gh-proxy.com/https://github.com/XTLS/Xray-core/releases/latest/download" \
    "https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/latest/download"; do
    [ -n "$base" ] || continue
    echo "[xray] trying $base"
    if curl -fsSL -m 60 -o /tmp/x.zip "$base/$FILE" && unzip -o -q /tmp/x.zip xray -d /usr/local/bin; then
      chmod +x "$BIN"; mkdir -p /data/xray && cp "$BIN" /data/xray/xray 2>/dev/null
      echo "[xray] installed"; break
    fi
  done
  rm -f /tmp/x.zip
fi
[ -x "$BIN" ] || echo "[xray] NOT available: VPN feature disabled. Copy an xray binary to the 'xray-data' volume (/data/xray/xray) or set XRAY_DOWNLOAD_BASE."
exec node dist/index.js
