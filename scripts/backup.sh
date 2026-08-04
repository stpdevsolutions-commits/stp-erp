#!/bin/bash
# Backup diario — PostgreSQL + volúmenes Docker + copia local + sync a Google Drive via rclone
# Cron: 0 2 * * * /home/stp/stp/scripts/backup.sh >> /home/stp/stp/logs/backup.log 2>&1
#
# El snapshot se construye SIEMPRE en disco local (/data/backups) y solo después
# se sube a Drive. Si Drive falla (p.ej. 403 rateLimitExceeded), la copia local
# queda intacta y el script termina con exit != 0 para que el fallo se note.
set -uo pipefail

DATE=$(date +%Y-%m-%d)
COMPOSE_DIR="/home/stp/stp"
LOCAL_BACKUP_ROOT="/data/backups"
BACKUP_DIR="$LOCAL_BACKUP_ROOT/snapshots/$DATE"
RCLONE_REMOTE="gdrive:backups diarios"
LOG_PREFIX="[backup $DATE]"

# Retención: local generosa (un snapshot pesa ~2 MB), remota 30 días.
LOCAL_RETENTION_DAYS=90
REMOTE_RETENTION_DAYS=30

# Reintentos de rclone — el 403 'Queries per minute' de la API de Drive es
# transitorio y se pasa esperando un poco entre intentos.
RCLONE_OPTS=(--retries 5 --retries-sleep 30s --low-level-retries 20 --tpslimit 4 --log-level INFO)

# Alerta opcional. Definir BACKUP_ALERT_URL en .env.backup (fuera de git):
# una URL de push de uptime-kuma o similar. Sin el archivo, no se alerta.
[ -f "$COMPOSE_DIR/.env.backup" ] && source "$COMPOSE_DIR/.env.backup"

ERRORS=0

log()  { echo "$LOG_PREFIX $*"; }
fail() { echo "$LOG_PREFIX ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }

# Reintenta un comando rclone COMPLETO con backoff.
#
# Necesario porque el 403 'rateLimitExceeded' de Drive aparece al construir el
# backend ("couldn't find root directory ID"), antes de transferir nada — y en
# ese punto el --retries de rclone todavía no está en juego. Hay que relanzar el
# proceso entero. El error es intermitente: suele pasar al segundo o tercer intento.
rclone_retry() {
  local attempt=1 max=4 wait=60
  while true; do
    if rclone "$@" "${RCLONE_OPTS[@]}"; then
      return 0
    fi
    if [ "$attempt" -ge "$max" ]; then
      return 1
    fi
    log "  rclone falló (intento $attempt/$max) — reintentando en ${wait}s..."
    sleep "$wait"
    attempt=$((attempt + 1))
    wait=$((wait * 2))
  done
}

# Ejecuta un paso y contabiliza el fallo sin abortar el resto del backup.
step() {
  local desc="$1"; shift
  if ! "$@"; then
    fail "$desc"
    return 1
  fi
}

log "Iniciando backup..."
# Sin destino local no hay backup que valga: abortar antes de tocar nada más.
# (/data es root:root — /data/backups debe existir y pertenecer a stp)
if ! mkdir -p "$BACKUP_DIR"; then
  fail "no se pudo crear $BACKUP_DIR — ¿permisos en $LOCAL_BACKUP_ROOT?"
  exit 1
fi

# ── PostgreSQL ────────────────────────────────────────────────────────────────
# pg_dump va a un .tmp y solo se renombra si el pipe completo tuvo éxito: así un
# dump truncado nunca queda con nombre de bueno.
dump_db() {
  local user="$1" db="$2" out="$3"
  if docker exec stp-postgres pg_dump -U "$user" "$db" | gzip > "$out.tmp"; then
    mv "$out.tmp" "$out"
  else
    rm -f "$out.tmp"
    return 1
  fi
}

log "Dumping PostgreSQL..."
step "dump de stp_db"       dump_db stp_user       stp_db       "$BACKUP_DIR/stp_db.sql.gz"
step "dump de nextcloud_db" dump_db nextcloud_user nextcloud_db "$BACKUP_DIR/nextcloud_db.sql.gz"

# ── Volúmenes Docker ──────────────────────────────────────────────────────────
dump_volume() {
  local vol="$1" out="$2"
  if docker run --rm -v "$vol":/data alpine tar czf - -C /data . > "$out.tmp"; then
    mv "$out.tmp" "$out"
  else
    rm -f "$out.tmp"
    return 1
  fi
}

log "Backup de volúmenes Docker..."
step "volumen vaultwarden" dump_volume stp_vaultwarden-data "$BACKUP_DIR/vaultwarden-data.tar.gz"
step "volumen caddy"       dump_volume stp_caddy-data       "$BACKUP_DIR/caddy-certs.tar.gz"

# ── Configs (sin .env — contiene secretos) ───────────────────────────────────
log "Backup de configuraciones..."
step "configs" tar czf "$BACKUP_DIR/configs.tar.gz" \
  -C "$COMPOSE_DIR" \
  docker-compose.yml \
  caddy/Caddyfile

# AdGuard (root-owned)
step "config de AdGuard" sudo tar czf "$BACKUP_DIR/adguard-conf.tar.gz" \
  -C "$COMPOSE_DIR/adguard" conf/

# ── Verificar que el snapshot no quedó vacío ─────────────────────────────────
FILE_COUNT=$(find "$BACKUP_DIR" -type f -name '*.gz' | wc -l)
log "Snapshot local: $FILE_COUNT archivos, $(du -sh "$BACKUP_DIR" | cut -f1) en $BACKUP_DIR"
[ "$FILE_COUNT" -eq 0 ] && fail "el snapshot quedó vacío"

# ── Subir snapshots de DB y configs a Google Drive ───────────────────────────
log "Subiendo snapshots a Google Drive..."
step "subida del snapshot a Drive" \
  rclone_retry copy "$BACKUP_DIR" "$RCLONE_REMOTE/snapshots/$DATE/"

# ── Sync incremental de archivos grandes ─────────────────────────────────────
log "Sync incremental de archivos..."
step "sync de nextcloud"   rclone_retry sync /storage/nextcloud   "$RCLONE_REMOTE/nextcloud/"
step "sync de erp-uploads" rclone_retry sync /storage/erp-uploads "$RCLONE_REMOTE/erp-uploads/"

# ── Retención ────────────────────────────────────────────────────────────────
log "Limpiando snapshots antiguos (local >${LOCAL_RETENTION_DAYS}d, Drive >${REMOTE_RETENTION_DAYS}d)..."
find "$LOCAL_BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d \
  -mtime +$LOCAL_RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
rclone delete "$RCLONE_REMOTE/snapshots/" --min-age ${REMOTE_RETENTION_DAYS}d --rmdirs 2>/dev/null || true

# ── Resultado ────────────────────────────────────────────────────────────────
if [ "$ERRORS" -eq 0 ]; then
  log "Backup completado."
  [ -n "${BACKUP_ALERT_URL:-}" ] && curl -fsS --max-time 15 \
    "$BACKUP_ALERT_URL?status=up&msg=ok" -o /dev/null 2>/dev/null || true
  exit 0
else
  log "Backup TERMINADO CON $ERRORS ERROR(ES) — revisar arriba. La copia local en $BACKUP_DIR se conserva."
  [ -n "${BACKUP_ALERT_URL:-}" ] && curl -fsS --max-time 15 \
    "$BACKUP_ALERT_URL?status=down&msg=$ERRORS+errores+en+el+backup" -o /dev/null 2>/dev/null || true
  exit 1
fi
