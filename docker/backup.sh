#!/bin/sh
# Backup of a complete f.orga installation: one pg_dump per database service and the plugin volumes,
# optionally docker/.env, into a dated folder; older backups beyond the retention are deleted.
#
#   docker/backup.sh [-f docker/compose.stages.yml] [-d /srv/backup/forga] [-k 30] [--with-env] [--encrypt]
#
# -f  compose file (default docker/compose.yml; all services whose name starts with "db" are dumped)
# -d  target folder (default ./backup)
# -k  number of backups to keep (default 30)
# --with-env  also copy docker/.env (passwords, FORGA_SECRET_KEY): keep the target folder protected
# --encrypt   encrypt every file with openssl (AES-256, key from the passphrase with PBKDF2) as it is written, so no
#             unencrypted copy touches the target; passphrase in FORGA_BACKUP_PASSPHRASE or the file named by
#             FORGA_BACKUP_PASSPHRASE_FILE. Decrypt: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in X.enc -out X
set -eu
# A failing pg_dump must fail the backup also when its output goes through openssl.
if (set -o pipefail) 2> /dev/null; then set -o pipefail; fi

COMPOSE=docker/compose.yml
TARGET=./backup
KEEP=30
WITH_ENV=false
ENCRYPT=false
while [ $# -gt 0 ]; do
  case "$1" in
    -f) COMPOSE=$2; shift 2 ;;
    -d) TARGET=$2; shift 2 ;;
    -k) KEEP=$2; shift 2 ;;
    --with-env) WITH_ENV=true; shift ;;
    --encrypt) ENCRYPT=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
if [ "$ENCRYPT" = true ]; then
  if [ -n "${FORGA_BACKUP_PASSPHRASE_FILE:-}" ]; then FORGA_BACKUP_PASSPHRASE=$(cat "$FORGA_BACKUP_PASSPHRASE_FILE"); fi
  FORGA_BACKUP_PASSPHRASE=${FORGA_BACKUP_PASSPHRASE:-}
  if [ "${#FORGA_BACKUP_PASSPHRASE}" -lt 12 ]; then
    echo "--encrypt needs FORGA_BACKUP_PASSPHRASE (at least 12 characters) or FORGA_BACKUP_PASSPHRASE_FILE" >&2
    exit 2
  fi
  export FORGA_BACKUP_PASSPHRASE
  command -v openssl > /dev/null || { echo "openssl is missing" >&2; exit 2; }
fi
# Writes standard input to the file $1, encrypted with --encrypt (then named $1.enc).
store() {
  if [ "$ENCRYPT" = true ]; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:FORGA_BACKUP_PASSPHRASE -out "$1.enc"
  else
    cat > "$1"
  fi
}
STAMP=$(date +%Y-%m-%d_%H%M)
DIR="$TARGET/forga-$STAMP"
mkdir -p "$DIR"
umask 077

# Databases: consistent dumps while running (custom format, compressed).
for service in $(docker compose -f "$COMPOSE" config --services | grep '^db'); do
  docker compose -f "$COMPOSE" exec -T "$service" pg_dump -U forga -d forga -Fc | store "$DIR/$service.dump"
  echo "$service: $(du -h "$DIR/$service.dump"* | cut -f1)"
done

# Plugins: straight from the running application containers that have a plugin folder.
for service in $(docker compose -f "$COMPOSE" config --services | grep -v '^db'); do
  docker compose -f "$COMPOSE" exec -T "$service" test -d /plugins 2> /dev/null || continue
  docker compose -f "$COMPOSE" exec -T "$service" tar czf - -C /plugins . | store "$DIR/$service-plugins.tgz"
  echo "$service plugins: $(du -h "$DIR/$service-plugins.tgz"* | cut -f1)"
done

if [ "$WITH_ENV" = true ] && [ -f docker/.env ]; then store "$DIR/env" < docker/.env; fi

# Keep the newest $KEEP backups.
COUNT=$(ls -1d "$TARGET"/forga-* 2> /dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1d "$TARGET"/forga-* | sort | head -n $((COUNT - KEEP)) | while read -r old; do rm -rf "$old"; done
fi
echo "Backup: $DIR"
