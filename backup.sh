#!/bin/sh
# Daily SQLite backup — run via cron on the VPS host:
#   0 3 * * * /opt/mobilelens/backup.sh >> /var/log/mobilelens-backup.log 2>&1
#
# Wymaga na samym hoście VPS (nie w kontenerze) pakietu `sqlite3` —
# integrity_check niżej woła je lokalnie na już skopiowanym pliku:
#   apt-get install -y sqlite3   # Debian/Ubuntu

set -e

# Wcześniej: CONTAINER="infra-api-1" zgadywało nazwę kontenera na podstawie
# domyślnej nazwy projektu Compose (nazwa katalogu). Działa tylko dopóki
# katalog nazywa się dokładnie "infra" i nikt nie ustawi COMPOSE_PROJECT_NAME
# / -p inaczej. `docker compose exec` adresuje serwis po nazwie z YAML-a
# ("api"), więc jest odporne na to, jak nazywa się sam kontener.
COMPOSE_DIR="/opt/mobilelens/infra"
SERVICE="api"

BACKUP_DIR="/opt/mobilelens/backups"
DATE=$(date +%Y-%m-%d)
DEST="$BACKUP_DIR/db-$DATE.sqlite"
TMP_IN_CONTAINER="/tmp/backup-$DATE.sqlite"

mkdir -p "$BACKUP_DIR"

cleanup() {
  # -T: brak pseudo-TTY (potrzebne pod cron, bez terminala).
  # `|| true`, żeby sprzątanie nie wysypało się, jeśli kontener już zniknął.
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T "$SERVICE" \
    rm -f "$TMP_IN_CONTAINER" || true
}
trap cleanup EXIT

# Online backup przez SQLite Backup API — bezpieczne również w trybie WAL
# (w przeciwieństwie do zwykłego `cp` pliku .sqlite, które mogłoby złapać
# niespójny stan, jeśli część danych siedzi jeszcze w pliku -wal).
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T "$SERVICE" \
  sqlite3 /app/data/db.sqlite ".backup '$TMP_IN_CONTAINER'"

docker compose -f "$COMPOSE_DIR/docker-compose.yml" cp \
  "$SERVICE:$TMP_IN_CONTAINER" "$DEST"

# Kopia, która "się zrobiła", ale jest uszkodzona, jest gorsza niż brak
# kopii — daje fałszywe poczucie bezpieczeństwa. Sprawdzamy ją, zanim
# uznamy backup za udany.
if ! sqlite3 "$DEST" "PRAGMA integrity_check;" | grep -q "^ok$"; then
  echo "[$(date)] BŁĄD: kopia $DEST nie przeszła integrity_check — usuwam" >&2
  rm -f "$DEST"
  exit 1
fi

# Keep only last 14 days
find "$BACKUP_DIR" -name "db-*.sqlite" -mtime +14 -delete

echo "[$(date)] Backup written to $DEST"

# TODO: to zabezpiecza tylko przed uszkodzeniem danych / błędem człowieka,
# NIE przed awarią samego VPS-a (dysk, konto u dostawcy, ransomware) — kopie
# leżą na tym samym serwerze co produkcja. Jeśli to ma być coś więcej niż
# "minimalne zabezpieczenie" (patrz plan wdrożenia, sekcja 9), dodaj tu
# synchronizację $BACKUP_DIR poza VPS, np.:
#   rclone sync "$BACKUP_DIR" remote:mobilelens-backups
# Warto też pomyśleć o kopii samych plików z MinIO (zdjęcia/wideo) —
# ten skrypt zabezpiecza wyłącznie metadane w SQLite.
