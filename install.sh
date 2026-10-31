#!/usr/bin/env bash
# Nexus Ad installer. Works on servers inside Iran (filtered registries) and abroad.
#   apt install -y git && (git -C /opt/nexus-ad pull --ff-only 2>/dev/null || git clone https://github.com/MasoudPourhossein/nexus-ad /opt/nexus-ad) && bash /opt/nexus-ad/install.sh
set -euo pipefail

BLUE='\033[1;34m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; NC='\033[0m'
say() { echo -e "${BLUE}==>${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }
ask() { local p="$1" d="${2:-}" v; read -rp "$(echo -e "${YELLOW}?${NC} $p ${d:+[$d] }")" v; echo "${v:-$d}"; }
rnd() { head -c "${1:-24}" /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-24}"; }
reachable() { curl -fsS -m 6 -o /dev/null "$1" 2>/dev/null; }

[ "$(id -u)" -eq 0 ] || { echo -e "${RED}Run as root${NC}"; exit 1; }
DIR="${NEXUS_DIR:-$(cd "$(dirname "$0")" && pwd)}"
cd "$DIR"

say "Checking tools..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1 || true
for t in curl git openssl; do command -v "$t" >/dev/null || apt-get install -y -qq "$t" >/dev/null; done

say "Detecting network restrictions..."
BLOCKED=0
reachable https://download.docker.com/linux/ubuntu/gpg || BLOCKED=1
reachable https://registry-1.docker.io/v2/ || BLOCKED=1
if [ "$BLOCKED" = "1" ]; then
  echo "   Docker registries are blocked here (typical inside Iran) → using distro packages + image mirror"
else
  echo "   Registries reachable → using official Docker"
fi

say "Installing Docker..."
if ! command -v docker >/dev/null; then
  if [ "$BLOCKED" = "1" ] || ! curl -fsSL https://get.docker.com | sh; then
    apt-get install -y -qq docker.io docker-compose-v2 >/dev/null
  fi
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-v2 >/dev/null
systemctl enable --now docker >/dev/null 2>&1 || true
if [ "$BLOCKED" = "1" ] && [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  echo '{ "registry-mirrors": ["https://docker.arvancloud.ir"] }' > /etc/docker/daemon.json
  systemctl restart docker >/dev/null 2>&1 || true
  ok "Image mirror set (docker.arvancloud.ir)"
fi
ok "Docker ready"

echo
say "Configuration (press Enter for defaults)"
PORT=$(ask "Dashboard port (random, hard to scan)" "$((RANDOM % 20000 + 30000))")
ADMIN_EMAIL=$(ask "Admin email" "admin@nexus.local")
ADMIN_PASS=$(ask "Admin password" "$(rnd 14)")
ENGINE=$(ask "WhatsApp engine (NOWEB/WEBJS/GOWS)" "NOWEB")
USE_SSL=$(ask "Enable HTTPS with a self-signed cert? (y/n) — no need to open 80/443" "y")

CERT_DIR="$DIR/certs"; mkdir -p "$CERT_DIR"
TLS_CERT=""; TLS_KEY=""; SCHEME="http"
if [ "$USE_SSL" = "y" ]; then
  if [ ! -f "$CERT_DIR/cert.pem" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
      -subj "/CN=nexus" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" 2>/dev/null
  fi
  TLS_CERT=/certs/cert.pem; TLS_KEY=/certs/key.pem; SCHEME="https"
  ok "Self-signed certificate at $CERT_DIR"
fi

if [ ! -f .env ]; then
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
else
  ok "Keeping existing .env"
fi

[ -f web/dist/index.html ] || { echo -e "${RED}web/dist missing — run build.sh on a dev machine and commit it${NC}"; exit 1; }
[ -f server/dist/index.js ] || { echo -e "${RED}server/dist missing — run build.sh on a dev machine and commit it${NC}"; exit 1; }

say "Starting containers (pre-built, nothing downloaded from npm)..."
docker compose up -d --build

install -m 755 "$DIR/nexus.sh" /usr/local/bin/nexus
IP=$(hostname -I | awk '{print $1}')
echo
ok "Nexus Ad is running."
echo -e "   URL:      ${GREEN}${SCHEME}://${IP}:${PORT}${NC}"
echo -e "   Admin:    ${ADMIN_EMAIL}"
echo -e "   Password: ${ADMIN_PASS}"
echo
echo -e "Manage:  ${BLUE}nexus status | nexus logs | nexus update | nexus backup | nexus uninstall${NC}"
echo -e "Only port ${PORT} is exposed. Restrict it:  ${BLUE}ufw allow from YOUR_IP to any port ${PORT}${NC}"
