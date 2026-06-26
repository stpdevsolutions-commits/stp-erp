#!/bin/bash
# Backup diario — PostgreSQL + volúmenes Docker + sync a Google Drive via rclone
# Cron: 0 2 * * * /home/stp/stp/scripts/backup.sh >> /var/log/stp-backup.log 2>&1
set -euo pipefail

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="/tmp/stp-backup-$TIMESTAMP"
COMPOSE_DIR="/home/stp/stp"
RCLONE_REMOTE="gdrive:backups diarios"
LOG_PREFIX="[backup $DATE]"

log() { echo "$LOG_PREFIX $*"; }

log "Iniciando backup..."
mkdir -p "$BACKUP_DIR"

# ── PostgreSQL ────────────────────────────────────────────────────────────────
log "Dumping PostgreSQL..."
docker exec stp-postgres pg_dump -U stp_user     stp_db       | gzip > "$BACKUP_DIR/stp_db.sql.gz"
docker exec stp-postgres pg_dump -U nextcloud_user nextcloud_db | gzip > "$BACKUP_DIR/nextcloud_db.sql.gz"
docker exec stp-postgres pg_dump -U outline_user outline_db   | gzip > "$BACKUP_DIR/outline_db.sql.gz"

# ── Volúmenes Docker ──────────────────────────────────────────────────────────
log "Backup de volúmenes Docker..."
docker run --rm -v stp_vaultwarden-data:/data alpine \
  tar czf - -C /data . > "$BACKUP_DIR/vaultwarden-data.tar.gz"

docker run --rm -v stp_caddy-data:/data alpine \
  tar czf - -C /data . > "$BACKUP_DIR/caddy-certs.tar.gz"

# ── Configs (sin .env — contiene secretos) ───────────────────────────────────
log "Backup de configuraciones..."
tar czf "$BACKUP_DIR/configs.tar.gz" \
  -C "$COMPOSE_DIR" \
  docker-compose.yml \
  caddy/Caddyfile \
  --exclude='adguard/work' 2>/dev/null || true

# AdGuard (root-owned)
sudo tar czf "$BACKUP_DIR/adguard-conf.tar.gz" \
  -C "$COMPOSE_DIR/adguard" conf/ 2>/dev/null || log "WARN: no se pudo hacer backup de AdGuard config"

# ── Subir snapshots de DB y configs a Google Drive ───────────────────────────
log "Subiendo snapshots a Google Drive..."
rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE/snapshots/$DATE/" \
  --log-level INFO 2>&1 | grep -v "^$"

# ── Sync incremental de archivos grandes ─────────────────────────────────────
log "Sync incremental de archivos..."
rclone sync /storage/nextcloud   "$RCLONE_REMOTE/nextcloud/"   --log-level INFO 2>&1 | grep -v "^$"
rclone sync /storage/outline     "$RCLONE_REMOTE/outline/"     --log-level INFO 2>&1 | grep -v "^$"
rclone sync /storage/erp-uploads "$RCLONE_REMOTE/erp-uploads/" --log-level INFO 2>&1 | grep -v "^$"

# ── Limpiar temp ─────────────────────────────────────────────────────────────
rm -rf "$BACKUP_DIR"

# ── Eliminar snapshots de más de 30 días ─────────────────────────────────────
log "Limpiando snapshots antiguos (>30 días)..."
rclone delete "$RCLONE_REMOTE/snapshots/" --min-age 30d --rmdirs 2>/dev/null || true

log "Backup completado."
