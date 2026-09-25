#!/bin/bash
# Backup diario COMPLETO del servidor — copia local + Google Drive vía rclone.
# Cron: 0 2 * * * /home/stp/stp/scripts/backup.sh >> /home/stp/stp/logs/backup.log 2>&1
#
# Qué respalda (2026-09-25, ampliado para cubrir todo el servidor):
#   snapshot diario (Drive: snapshots/<fecha>/, 30 días; local 14 días):
#     - TODAS las bases de TODOS los contenedores PostgreSQL (pg_dumpall por
#       contenedor, se descubren solos: una base nueva entra sin tocar esto)
#     - volúmenes: vaultwarden, certificados de caddy
#     - configuración de Nextcloud (config.php: sin ella no se restaura)
#     - configs: docker-compose de cada proyecto, Caddyfile, AdGuard, crontab,
#       red/firewall/docker/ssh del sistema
#     - código que NO está en GitHub (fantasy-nba-assistant, cambios locales de
#       hermes-agent, oracle-headscale, fiscord-backup) y datos de Hermes
#     - secretos (.env, llaves ssh, rclone): CIFRADOS con GPG antes de salir
#       del disco; la clave vive en .env.backup y DEBE guardarse fuera del server
#   sync incremental (Drive: nextcloud/, erp-uploads/, immich/):
#     - lo borrado o cambiado se guarda 30 días en _eliminados/<fecha>/ en vez
#       de perderse con el sync
#
# Qué NO respalda, a propósito (se regenera): imágenes Docker (se construyen
# desde git), miniaturas y videos recodificados de Immich, caché de modelos
# de Immich, android-sdk, containerd.
#
# El snapshot se construye SIEMPRE en disco local (/data/backups) y solo después
# se sube a Drive. Si Drive falla, la copia local queda y el script sale != 0.
set -uo pipefail

DATE=$(date +%Y-%m-%d)
HOME_DIR="/home/stp"
COMPOSE_DIR="$HOME_DIR/stp"
LOCAL_BACKUP_ROOT="/data/backups"
BACKUP_DIR="$LOCAL_BACKUP_ROOT/snapshots/$DATE"
RCLONE_REMOTE="gdrive:backups diarios"
LOG_PREFIX="[backup $DATE]"
LOCAL_RETENTION_DAYS=14
REMOTE_RETENTION_DAYS=30
RCLONE_OPTS=(--retries 5 --retries-sleep 30s --low-level-retries 20 --tpslimit 4 --log-level INFO)
# De día (8:00–23:00) la subida se limita para no ahogar el internet de la casa.
RCLONE_BW=(--bwlimit "08:00,3M 23:00,off")
IMMICH_LOCK=/tmp/backup-immich.lock

# .env.backup: BACKUP_GPG_PASSPHRASE (obligatoria para los secretos),
# BACKUP_ALERT_URL (opcional). TELEGRAM_* se leen de .env para avisar fallos.
[ -f "$COMPOSE_DIR/.env.backup" ] && source "$COMPOSE_DIR/.env.backup"
env_get() { grep "^$1=" "$COMPOSE_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }

ERRORS=0
FALLOS=""
log()  { echo "$LOG_PREFIX $*"; }
fail() { echo "$LOG_PREFIX ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); FALLOS="$FALLOS\n• $*"; }

# rclone con reintentos propios encima de los de rclone: los 403 rateLimitExceeded
# de Drive vienen en ráfagas y un par de minutos de espera los resuelve.
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

# Escribe a .tmp y solo renombra si todo el pipe salió bien: un archivo a medias
# nunca queda con nombre de bueno.
guardar() {
  local out="$1"; shift
  if "$@" > "$out.tmp"; then
    mv "$out.tmp" "$out"
  else
    rm -f "$out.tmp"
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

# ── PostgreSQL: todos los contenedores, todas las bases ──────────────────────
# pg_dumpall incluye roles y permisos: con esto se reconstruye el servidor de
# base de datos entero, no solo las tablas.
log "Dumping PostgreSQL (todos los contenedores)..."
dumpall() {
  local c="$1" user
  user=$(docker exec "$c" printenv POSTGRES_USER 2>/dev/null)
  user=${user:-postgres}
  docker exec "$c" pg_dumpall -U "$user" --clean --if-exists | gzip
}
PG_CONTAINERS=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /postgres|pgvecto/ {print $1}')
[ -z "$PG_CONTAINERS" ] && fail "no se encontró ningún contenedor PostgreSQL"
for c in $PG_CONTAINERS; do
  step "dump de $c" guardar "$BACKUP_DIR/db-$c.sql.gz" dumpall "$c"
done

# ── Volúmenes Docker ──────────────────────────────────────────────────────────
dump_volume() {
  docker run --rm -v "$1":/data:ro alpine tar czf - -C /data .
}
log "Backup de volúmenes Docker..."
step "volumen vaultwarden" guardar "$BACKUP_DIR/vaultwarden-data.tar.gz" dump_volume stp_vaultwarden-data
step "volumen caddy"       guardar "$BACKUP_DIR/caddy-certs.tar.gz"      dump_volume stp_caddy-data
step "config de Nextcloud" guardar "$BACKUP_DIR/nextcloud-config.tar.gz" \
  docker exec stp-nextcloud tar czf - -C /var/www/html config

# ── Configuración (sin secretos: los .env van cifrados aparte) ───────────────
log "Backup de configuraciones..."
configs() {
  local lista
  lista=$(cd / && find "${HOME_DIR#/}" data/estructuralrd -maxdepth 3 \
    \( -name 'docker-compose*.yml' -o -name 'Caddyfile' -o -name 'Dockerfile' \) \
    -not -path '*/node_modules/*' 2>/dev/null)
  crontab -l > "$BACKUP_DIR/crontab.txt" 2>/dev/null || true
  # shellcheck disable=SC2086
  tar czf - -C / $lista
}
step "configs de proyectos" guardar "$BACKUP_DIR/configs.tar.gz" configs
step "config de AdGuard" guardar "$BACKUP_DIR/adguard-conf.tar.gz" \
  sudo -n tar czf - -C "$COMPOSE_DIR/adguard" conf/
step "config del sistema" guardar "$BACKUP_DIR/sistema-etc.tar.gz" \
  sudo -n tar czf - --ignore-failed-read -C / \
    etc/netplan etc/ufw etc/docker/daemon.json etc/containerd/config.toml \
    etc/ssh/sshd_config etc/fstab etc/hosts etc/systemd/system/cloudflared.service

# ── Código que no está en GitHub + datos de Hermes (sin secretos) ────────────
log "Backup de código local y Hermes..."
EXCL=(--exclude='.env' --exclude='.env.*' --exclude='*.pem' --exclude='*.key'
      --exclude='node_modules' --exclude='.venv' --exclude='venv' --exclude='__pycache__'
      --exclude='.cache' --exclude='*.log')
codigo_local() {
  local tmp; tmp=$(mktemp -d)
  # hermes-agent es un clon de un repo ajeno: solo interesan los cambios locales.
  git -C "$HOME_DIR/hermes-agent" diff HEAD > "$tmp/hermes-agent-cambios.patch" 2>/dev/null
  git -C "$HOME_DIR/hermes-agent" ls-files --others --exclude-standard -z 2>/dev/null \
    | tar czf "$tmp/hermes-agent-nuevos.tar.gz" -C "$HOME_DIR/hermes-agent" --null -T - "${EXCL[@]}" 2>/dev/null
  tar czf - "${EXCL[@]}" -C "$tmp" . -C "$HOME_DIR" fantasy-nba-assistant oracle-headscale fiscord-backup
  local rc=$?
  rm -rf "$tmp"
  return $rc
}
step "código local" guardar "$BACKUP_DIR/codigo-local.tar.gz" codigo_local
step "datos de Hermes" guardar "$BACKUP_DIR/hermes-datos.tar.gz" \
  tar czf - "${EXCL[@]}" --exclude='.hermes/bin' --exclude='.hermes/logs' --exclude='.hermes/home/.cache' \
    -C "$HOME_DIR" .hermes

# ── Secretos: cifrados ANTES de salir del disco ──────────────────────────────
log "Backup cifrado de secretos..."
secretos() {
  local lista
  lista=$( (cd / && find "${HOME_DIR#/}" data -maxdepth 5 -type f -name '.env*' \
      -not -name '*.example' -not -path '*/node_modules/*' -not -path 'data/docker/*' \
      -not -path 'data/containerd/*' -not -path 'data/backups/*' 2>/dev/null) )
  # shellcheck disable=SC2086
  sudo -n tar czf - --ignore-failed-read -C / $lista \
      "${HOME_DIR#/}/.ssh" "${HOME_DIR#/}/.config/rclone" data/stp/secrets \
    | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_GPG_PASSPHRASE" \
          --symmetric --cipher-algo AES256 -o -
}
if [ -z "${BACKUP_GPG_PASSPHRASE:-}" ]; then
  fail "falta BACKUP_GPG_PASSPHRASE en .env.backup: los secretos NO se respaldaron"
else
  step "secretos cifrados" guardar "$BACKUP_DIR/secretos.tar.gz.gpg" secretos
fi

# ── Verificar que el snapshot no quedó vacío ─────────────────────────────────
FILE_COUNT=$(find "$BACKUP_DIR" -type f \( -name '*.gz' -o -name '*.gpg' \) | wc -l)
log "Snapshot local: $FILE_COUNT archivos, $(du -sh "$BACKUP_DIR" | cut -f1) en $BACKUP_DIR"
[ "$FILE_COUNT" -eq 0 ] && fail "el snapshot quedó vacío"

log "Subiendo snapshot a Google Drive..."
step "subida del snapshot a Drive" \
  rclone_retry copy "$BACKUP_DIR" "$RCLONE_REMOTE/snapshots/$DATE/"

# ── Sync incremental de archivos grandes ─────────────────────────────────────
# Lo que se borra o cambia en el servidor NO se pierde en Drive: va a
# _eliminados/<fecha>/ durante 30 días (protege de un borrado accidental o de
# un ransomware que el sync copiaría tal cual).
sync_seguro() {
  local origen="$1" destino="$2"; shift 2
  rclone_retry sync "$origen" "$RCLONE_REMOTE/$destino/" \
    --backup-dir "$RCLONE_REMOTE/_eliminados/$DATE/$destino" "${RCLONE_BW[@]}" "$@"
}
log "Sync incremental de archivos..."
step "sync de nextcloud"   sync_seguro /storage/nextcloud   nextcloud
step "sync de erp-uploads" sync_seguro /storage/erp-uploads erp-uploads
# Immich: originales + respaldos de su base. Las miniaturas y los videos
# recodificados se regeneran solos. El lock evita pisarse con una subida
# larga en curso (la primera son ~140 GB).
immich_sync() {
  exec 9>"$IMMICH_LOCK"
  if ! flock -n 9; then
    log "  sync de Immich omitido: hay una subida de Immich en curso."
    return 0
  fi
  rclone_retry sync /storage/immich "$RCLONE_REMOTE/immich/" \
    --exclude 'thumbs/**' --exclude 'encoded-video/**' \
    --backup-dir "$RCLONE_REMOTE/_eliminados/$DATE/immich" "${RCLONE_BW[@]}" --transfers 4
  local rc=$?
  flock -u 9
  return $rc
}
step "sync de immich" immich_sync

# ── Retención ────────────────────────────────────────────────────────────────
log "Limpiando antiguos (local >${LOCAL_RETENTION_DAYS}d, Drive >${REMOTE_RETENTION_DAYS}d)..."
find "$LOCAL_BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d \
  -mtime +$LOCAL_RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
rclone delete "$RCLONE_REMOTE/snapshots/"  --min-age ${REMOTE_RETENTION_DAYS}d --rmdirs 2>/dev/null || true
rclone delete "$RCLONE_REMOTE/_eliminados/" --min-age ${REMOTE_RETENTION_DAYS}d --rmdirs 2>/dev/null || true

# ── Resultado ────────────────────────────────────────────────────────────────
avisar() {
  local tg_token tg_chat
  tg_token=$(env_get TELEGRAM_BOT_TOKEN)
  tg_chat=$(env_get TELEGRAM_CHAT_ID)
  [ -n "$tg_token" ] && [ -n "$tg_chat" ] || return 0
  curl -s -m 15 -o /dev/null "https://api.telegram.org/bot$tg_token/sendMessage" \
    --data-urlencode "chat_id=$tg_chat" --data-urlencode "text=$1"
}
if [ "$ERRORS" -eq 0 ]; then
  log "Backup completado."
  [ -n "${BACKUP_ALERT_URL:-}" ] && curl -fsS --max-time 15 \
    "$BACKUP_ALERT_URL?status=up&msg=ok" -o /dev/null 2>/dev/null || true
  exit 0
else
  log "Backup TERMINADO CON $ERRORS ERROR(ES) — revisar arriba. La copia local en $BACKUP_DIR se conserva."
  avisar "$(printf "⚠️ Backup del servidor STP ($DATE) terminó con $ERRORS error(es):$FALLOS\n\nLog: ~/stp/logs/backup.log")"
  [ -n "${BACKUP_ALERT_URL:-}" ] && curl -fsS --max-time 15 \
    "$BACKUP_ALERT_URL?status=down&msg=$ERRORS+errores+en+el+backup" -o /dev/null 2>/dev/null || true
  exit 1
fi
