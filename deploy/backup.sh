#!/usr/bin/env bash
# Nightly PostgreSQL backup. Cron example (as the postgres user):
#   15 3 * * * /opt/pet-puja/backup.sh >> /var/log/pet-puja-backup.log 2>&1
# Optional: set S3_BUCKET (needs the aws CLI and an instance role with s3:PutObject).
set -euo pipefail
DB_NAME="${DB_NAME:-pet_puja}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pet-puja}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/$DB_NAME-$(date -u +%Y-%m-%d-%H%M%S).dump"
pg_dump --format=custom --file="$FILE" "$DB_NAME"
pg_restore --list "$FILE" > /dev/null   # sanity check that the dump is readable
[ -z "${S3_BUCKET:-}" ] || aws s3 cp "$FILE" "s3://$S3_BUCKET/pet-puja/"
find "$BACKUP_DIR" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $FILE"
