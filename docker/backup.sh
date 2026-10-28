#!/bin/sh
# Backup of a complete f.orga installation: one pg_dump per database service and the plugin volumes,
# optionally docker/.env, into a dated folder; older backups beyond the retention are deleted.
#
#   docker/backup.sh [-f docker/compose.stages.yml] [-d /srv/backup/forga] [-k 30] [--with-env]
#
# -f  compose file (default docker/compose.yml; all services whose name starts with "db" are dumped)
# -d  target folder (default ./backup)
# -k  number of backups to keep (default 30)
# --with-env  also copy docker/.env (passwords, FORGA_SECRET_KEY): keep the target folder protected
set -eu

COMPOSE=docker/compose.yml
TARGET=./backup
KEEP=30
WITH_ENV=false
while [ $# -gt 0 ]; do
  case "$1" in
    -f) COMPOSE=$2; shift 2 ;;
    -d) TARGET=$2; shift 2 ;;
    -k) KEEP=$2; shift 2 ;;
    --with-env) WITH_ENV=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M)
DIR="$TARGET/forga-$STAMP"
mkdir -p "$DIR"
umask 077

# Databases: consistent dumps while running (custom format, compressed).
for service in $(docker compose -f "$COMPOSE" config --services | grep '^db'); do
  docker compose -f "$COMPOSE" exec -T "$service" pg_dump -U forga -d forga -Fc > "$DIR/$service.dump"
  echo "$service: $(du -h "$DIR/$service.dump" | cut -f1)"
done

# Plugins: straight from the running application containers that have a plugin folder.
for service in $(docker compose -f "$COMPOSE" config --services | grep -v '^db'); do
  docker compose -f "$COMPOSE" exec -T "$service" test -d /plugins 2> /dev/null || continue
  docker compose -f "$COMPOSE" exec -T "$service" tar czf - -C /plugins . > "$DIR/$service-plugins.tgz"
  echo "$service plugins: $(du -h "$DIR/$service-plugins.tgz" | cut -f1)"
done

if [ "$WITH_ENV" = true ] && [ -f docker/.env ]; then cp docker/.env "$DIR/env"; fi

# Keep the newest $KEEP backups.
COUNT=$(ls -1d "$TARGET"/forga-* 2> /dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1d "$TARGET"/forga-* | sort | head -n $((COUNT - KEEP)) | while read -r old; do rm -rf "$old"; done
fi
echo "Backup: $DIR"
