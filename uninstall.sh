#!/usr/bin/env bash
# Remove Nexus Ad completely: containers, volumes (ALL DATA), images, files, CLI.
# Also cleans the old /opt/nexus layout. Pass --docker to remove Docker itself too.
set -uo pipefail
RED='\033[1;31m'; GREEN='\033[1;32m'; NC='\033[0m'
[ "$(id -u)" -eq 0 ] || { echo -e "${RED}Run as root${NC}"; exit 1; }
echo -e "${RED}This deletes Nexus Ad AND all its data (sessions, contacts, campaigns).${NC}"
read -rp "Type YES to continue: " c; [ "$c" = "YES" ] || { echo "Aborted."; exit 1; }
for d in /opt/nexus-ad /opt/nexus/nexus; do
  if [ -f "$d/docker-compose.yml" ]; then
    echo "==> Removing stack in $d"
    ( cd "$d" && docker compose down -v --remove-orphans --rmi local 2>/dev/null || true )
  fi
done
# volumes from any project name that was ever used
docker volume ls -q 2>/dev/null | grep -E '^(nexus|nexus-ad|nexus_|nexus-ad_)' | xargs -r docker volume rm 2>/dev/null || true
docker images -q 'nexus-ad-nexus' 'nexus-nexus' 2>/dev/null | xargs -r docker rmi -f 2>/dev/null || true
rm -rf /opt/nexus-ad /opt/nexus /usr/local/bin/nexus
ufw status 2>/dev/null | grep -q LIMIT && echo "Note: ufw rules for the old port were left in place (ufw status)."
if [ "${1:-}" = "--docker" ]; then
  echo "==> Removing Docker"
  apt-get purge -y docker.io docker-compose-v2 docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1 || true
  rm -rf /var/lib/docker /etc/docker
fi
echo -e "${GREEN}✓ Nexus Ad removed.${NC}"
