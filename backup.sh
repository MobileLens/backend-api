#!/bin/sh
# Daily SQLite backup — run via cron on the VPS host:
#   0 3 * * * /opt/mobilelens/backup.sh >> /var/log/mobilelens-backup.log 2>&1

set -e

CONTAINER="infra-api-1"          # docker compose service name
BACKUP_DIR="/opt/mobilelens/backups"
DATE=$(date +%Y-%m-%d)
DEST="$BACKUP_DIR/db-$DATE.sqlite"

mkdir -p "$BACKUP_DIR"

# Use SQLite's online backup via the running container
docker exec "$CONTAINER" sqlite3 /app/data/db.sqlite ".backup '/tmp/backup.sqlite'"
docker cp "$CONTAINER:/tmp/backup.sqlite" "$DEST"
docker exec "$CONTAINER" rm /tmp/backup.sqlite

# Keep only last 14 days
find "$BACKUP_DIR" -name "db-*.sqlite" -mtime +14 -delete

echo "[$(date)] Backup written to $DEST"
