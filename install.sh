#!/usr/bin/env bash
# Nexus Ad installer. Run on the LXC/VM:
#   bash <(curl -fsSL https://raw.githubusercontent.com/MasoudPourhossein/nexus-ad/nexus/install.sh)
set -euo pipefail

BLUE='\033[1;34m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; NC='\033[0m'
say() { echo -e "${BLUE}==>${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }
ask() { local p="$1" d="${2:-}" v; read -rp "$(echo -e "${YELLOW}?${NC} $p ${d:+[$d] }")" v; echo "${v:-$d}"; }
rnd() { head -c "${1:-24}" /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-24}"; }

[ "$(id -u)" -eq 0 ] || { echo -e "${RED}Run as root${NC}"; exit 1; }

say "Installing Docker and dependencies..."
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
command -v openssl >/dev/null || { apt-get update -qq && apt-get install -y -qq openssl git; }
ok "Docker ready"

DIR="${NEXUS_DIR:-/opt/nexus-ad}"
if [ ! -d "$DIR/.git" ]; then
  say "Cloning into $DIR..."
  git clone -q --depth 1 -b main https://github.com/MasoudPourhossein/nexus-ad "$DIR"
else
  git -C "$DIR" pull -q || true
fi
cd "$DIR"

echo
say "Configuration (press Enter for defaults)"
PORT=$(ask "Dashboard port (random, hard to scan)" "$((RANDOM % 20000 + 30000))")
ADMIN_EMAIL=$(ask "Admin email" "admin@nexus.local")
ADMIN_PASS=$(ask "Admin password" "$(rnd 14)")
ENGINE=$(ask "WhatsApp engine (WEBJS/NOWEB/GOWS)" "NOWEB")
USE_SSL=$(ask "Enable HTTPS with a self-signed cert? (y/n) — no need to open 80/443" "y")

CERT_DIR="$DIR/certs"; mkdir -p "$CERT_DIR"
TLS_CERT=""; TLS_KEY=""; SCHEME="http"
if [ "$USE_SSL" = "y" ]; then
  if [ ! -f "$CERT_DIR/cert.pem" ]; then
    say "Generating self-signed certificate (10 years)..."
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
      -subj "/CN=nexus" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" 2>/dev/null
  fi
  TLS_CERT=/certs/cert.pem; TLS_KEY=/certs/key.pem; SCHEME="https"
  ok "Certificate at $CERT_DIR (import cert.pem in your browser to avoid the warning)"
fi

cat > .env <<EOF
PUBLIC_PORT=$PORT
DB_PASSWORD=$(rnd 24)
JWT_SECRET=$(rnd 40)
WEBHOOK_SECRET=$(rnd 32)
WAHA_API_KEY=$(rnd 28)
WAHA_ENGINE=$ENGINE
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASS
TLS_CERT=$TLS_CERT
TLS_KEY=$TLS_KEY
CERT_DIR=./certs
EOF
chmod 600 .env
ok "Wrote .env"

if [ ! -d web/dist ]; then
  say "Building dashboard (needs Node or uses a container)..."
  if command -v npm >/dev/null; then (cd web && npm install -q && npm run build); \
  else docker run --rm -v "$PWD/web":/w -w /w node:22-slim sh -c "npm install -q && npm run build"; fi
fi

say "Starting containers..."
docker compose up -d --build

install -m 755 "$DIR/nexus.sh" /usr/local/bin/nexus
ok "Installed 'nexus' command (try: nexus status, nexus update)"

IP=$(hostname -I | awk '{print $1}')
echo
ok "Nexus Ad is running."
echo -e "   URL:      ${GREEN}${SCHEME}://${IP}:${PORT}${NC}"
echo -e "   Admin:    ${ADMIN_EMAIL}"
echo -e "   Password: ${ADMIN_PASS}"
echo
echo -e "${YELLOW}Security:${NC} only port ${PORT} is exposed. Login is rate-limited and lockout-protected."
echo -e "To restrict to your IP:  ${BLUE}ufw allow from YOUR_IP to any port ${PORT}${NC}"
echo -e "Update anytime:          ${BLUE}nexus update${NC}"
