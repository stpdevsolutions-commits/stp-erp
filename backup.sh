#!/bin/bash
# Backup diario: PostgreSQL + /storage
set -euo pipefail

BACKUP_DIR="/home/stp/backups"
DATE=$(date +%Y-%m-%d)
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup..."

# PostgreSQL
docker exec stp-postgres pg_dumpall -U stp_user \
  | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"
echo "[$(date)] Base de datos: OK ($(du -sh "$BACKUP_DIR/postgres_$DATE.sql.gz" | cut -f1))"

# Archivos /storage
tar -czf "$BACKUP_DIR/storage_$DATE.tar.gz" -C /storage . 2>/dev/null || true
echo "[$(date)] Archivos /storage: OK ($(du -sh "$BACKUP_DIR/storage_$DATE.tar.gz" | cut -f1))"

# Uptime Kuma (SQLite)
docker cp stp-uptime-kuma:/app/data/kuma.db "$BACKUP_DIR/kuma_$DATE.db" 2>/dev/null || true

# Limpiar backups con más de 7 días
find "$BACKUP_DIR" -maxdepth 1 -name "*.gz" -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -maxdepth 1 -name "*.db" -mtime +$KEEP_DAYS -delete

echo "[$(date)] Backup completado. Archivos en $BACKUP_DIR:"
ls -lh "$BACKUP_DIR/"
