#!/usr/bin/env bash
# Backs up the personal database to backups/ (gitignored, outside every Docker build context) as a pg_dump custom-format file.
# If BACKUP_DIR is set (in the environment or .env), the dump is also copied there.
# Restore: docker exec -i folioprism-personal-db pg_restore -U lens -d folioprism --clean --if-exists < <file>
set -euo pipefail
cd "$(dirname "$0")/.."

out_dir=backups
out_file="$out_dir/folioprism-personal-$(date +%Y%m%d-%H%M%S).dump"
mkdir -p "$out_dir"

docker exec folioprism-personal-db pg_dump -U lens -d folioprism -Fc > "$out_file"
echo "Backup written to $out_file"

if [ -z "${BACKUP_DIR:-}" ] && [ -f .env ]; then
  BACKUP_DIR=$(sed -n 's/^BACKUP_DIR=//p' .env | tail -n 1)
fi
if [ -n "${BACKUP_DIR:-}" ]; then
  mkdir -p "$BACKUP_DIR"
  cp "$out_file" "$BACKUP_DIR/"
  echo "Copied to $BACKUP_DIR"
fi
