#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR=${BACKUP_DIR:-"$ROOT_DIR/backups"}
RETENTION_DAYS=${RETENTION_DAYS:-7}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

compose() {
  docker compose \
    --env-file "$ROOT_DIR/.env.production" \
    -f "$ROOT_DIR/docker-compose.prod.yml" "$@"
}

mkdir -p "$BACKUP_DIR"

compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$BACKUP_DIR/postgres-$STAMP.dump"

compose exec -T api tar -czf - -C /data uploads \
  > "$BACKUP_DIR/uploads-$STAMP.tar.gz"

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" \
  \( -name 'postgres-*.dump' -o -name 'uploads-*.tar.gz' \) -delete

echo "Backup concluído em $BACKUP_DIR ($STAMP)"
