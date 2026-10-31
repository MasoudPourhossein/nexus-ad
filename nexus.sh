#!/usr/bin/env bash
# Nexus Ad management CLI. Installed as /usr/local/bin/nexus
set -euo pipefail
DIR="${NEXUS_DIR:-/opt/nexus-ad}"
cd "$DIR" 2>/dev/null || { echo "Nexus not found at $DIR"; exit 1; }
case "${1:-help}" in
  update)   bash "$DIR/update.sh" ;;
  uninstall) bash "$DIR/uninstall.sh" "${2:-}" ;;
  up|start) docker compose up -d ;;
  down|stop) docker compose down ;;
  restart)  docker compose restart "${2:-}" ;;
  logs)     docker compose logs -f --tail=200 "${2:-nexus}" ;;
  ps|status) docker compose ps ;;
  backup)   f="nexus-backup-$(date +%Y%m%d-%H%M%S).sql.gz"; docker compose exec -T db pg_dump -U nexus nexus | gzip > "$f"; echo "Saved $f" ;;
  restore)  [ -f "${2:-}" ] || { echo "usage: nexus restore <file.sql.gz>"; exit 1; }; gunzip -c "$2" | docker compose exec -T db psql -U nexus nexus; echo "Restored" ;;
  reset-admin) read -rsp "New admin password: " p; echo; docker compose exec -T db psql -U nexus nexus -c "UPDATE tenants SET password_hash = crypt('$p', gen_salt('bf')) WHERE role='admin'" 2>/dev/null || echo "Run from the dashboard instead if pgcrypto is unavailable." ;;
  *) echo "Nexus Ad — usage:
  nexus update            update to the latest version
  nexus uninstall [--docker]  remove everything (and Docker with --docker)
  nexus up | down | restart [svc]
  nexus logs [svc]        follow logs (default: nexus)
  nexus status            container status
  nexus backup            dump the database to a .sql.gz
  nexus restore <file>    restore a dump" ;;
esac
