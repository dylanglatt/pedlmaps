#!/usr/bin/env bash
# backup_db.sh — offsite backup of the pedl SQLite snapshot DB.
#
# Takes a consistent snapshot with sqlite3 .backup (safe while the collector is
# writing), gzips it, keeps the last N locally, and ships it to $BACKUP_DEST —
# which must be OFFSITE (your Mac over SSH, or a DigitalOcean Space), not another
# path on this same droplet, or the backup dies with the box.
#
# cron (daily at 03:15 NYC — the droplet TZ should be America/New_York):
#   15 3 * * * BACKUP_DEST='you@your-mac.local:~/pedl-backups/' /home/YOURUSER/citi-bike-app/scripts/droplet/backup_db.sh >> ~/pedl_backup.log 2>&1
#
# Env:
#   PEDL_DB      source DB (default: ~/pedl.db)
#   BACKUP_DEST  rsync/scp destination (REQUIRED). Examples:
#                  you@your-mac.local:~/pedl-backups/     (Mac over SSH)
#                  s3://pedl-backups/                     (DO Space, needs `aws`/`s3cmd` configured)
#   KEEP         local gz backups to retain (default: 14)
set -euo pipefail

PEDL_DB="${PEDL_DB:-$HOME/pedl.db}"
KEEP="${KEEP:-14}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/pedl-backups}"

die() { echo "backup_db: ERROR: $*" >&2; exit 1; }

[ -n "${BACKUP_DEST:-}" ] || die "BACKUP_DEST is not set (must be an offsite dest)"
[ -f "$PEDL_DB" ] || die "source DB not found: $PEDL_DB"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not installed"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d)"
RAW="/tmp/pedl-${STAMP}.db"
GZ="${BACKUP_DIR}/pedl-${STAMP}.db.gz"

rm -f "$RAW" "$GZ"

# Consistent online backup. sqlite3 exits non-zero on failure; set -e catches it.
sqlite3 "$PEDL_DB" ".backup '${RAW}'" || die "sqlite3 .backup failed"
[ -s "$RAW" ] || die "backup is 0 bytes: $RAW"

gzip -f "$RAW"                      # -> $RAW.gz
mv -f "${RAW}.gz" "$GZ"
[ -s "$GZ" ] || die "gzip produced a 0-byte file: $GZ"

# Ship offsite. rsync over SSH for host:path dests; otherwise fall back to a copy
# tool that understands the scheme (scp for host:path, aws/s3cmd for s3://).
if [[ "$BACKUP_DEST" == s3://* ]]; then
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "$GZ" "$BACKUP_DEST" || die "aws s3 cp to $BACKUP_DEST failed"
  elif command -v s3cmd >/dev/null 2>&1; then
    s3cmd put "$GZ" "$BACKUP_DEST" || die "s3cmd put to $BACKUP_DEST failed"
  else
    die "BACKUP_DEST is an s3:// URL but neither aws nor s3cmd is installed"
  fi
elif command -v rsync >/dev/null 2>&1; then
  rsync -az "$GZ" "$BACKUP_DEST" || die "rsync to $BACKUP_DEST failed"
else
  scp "$GZ" "$BACKUP_DEST" || die "scp to $BACKUP_DEST failed"
fi

# Prune local copies, keeping the newest $KEEP.
ls -1t "$BACKUP_DIR"/pedl-*.db.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
done

echo "backup_db: OK $(basename "$GZ") ($(wc -c < "$GZ") bytes) -> $BACKUP_DEST"
