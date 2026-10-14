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
#
# PROPUESTA INF-16 (no activa): frase GPG y token de Telegram fuera de `ps`,
# fallos de retención registrados ("con avisos"), alerta de disco, retención
# local más segura y cifrado opcional de lo que sube a Drive (apagado por
# defecto: BACKUP_ENCRYPT_UPLOAD=0 y BACKUP_CRYPT_SYNC vacío).
# Ensayo sin tocar nada real: BACKUP_TEST_ROOT, BACKUP_HOME_DIR, BACKUP_RCLONE_REMOTE,
# BACKUP_STORAGE_ROOT, BACKUP_IMMICH_LOCK y BACKUP_DRY_RUN (ver scripts/ensayo-backup.sh.propuesta).
set -uo pipefail

DATE=$(date +%Y-%m-%d)
HOME_DIR="${BACKUP_HOME_DIR:-/home/stp}"        # solo se cambia en ensayos
COMPOSE_DIR="$HOME_DIR/stp"
LOCAL_BACKUP_ROOT="/data/backups"
DISK_ALERT_PCT="${BACKUP_DISK_ALERT_PCT:-85}"
DISK_ALERT_STAMP="$COMPOSE_DIR/logs/.alerta-disco"
LOCAL_KEEP_MIN=3          # nunca borrar los últimos N snapshots locales
# Cifrado de lo que sube a Drive (opt-in, ver .env.backup):
#   BACKUP_ENCRYPT_UPLOAD=1        cifra con GPG los archivos del snapshot antes de subirlos
#   BACKUP_CRYPT_SYNC="erp-uploads nextcloud"   syncs que van por rclone crypt (cifra nombres y contenido)
BACKUP_ENCRYPT_UPLOAD=0
BACKUP_CRYPT_SYNC=""
# Solo para ensayos: redirige TODO lo local a un directorio temporal y hace rclone --dry-run.
if [ -n "${BACKUP_TEST_ROOT:-}" ]; then
  LOCAL_BACKUP_ROOT="$BACKUP_TEST_ROOT/backups"
  DISK_ALERT_STAMP="$BACKUP_TEST_ROOT/alerta-disco"
fi
BACKUP_DIR="$LOCAL_BACKUP_ROOT/snapshots/$DATE"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-gdrive:backups diarios}"   # idem
LOG_PREFIX="[backup $DATE]"
LOCAL_RETENTION_DAYS=14
REMOTE_RETENTION_DAYS=30
RCLONE_OPTS=(--retries 5 --retries-sleep 30s --low-level-retries 20 --tpslimit 4 --log-level INFO)
# --fast-list: lista Drive entero en pocas llamadas en vez de una por carpeta
# (con --tpslimit 4, Nextcloud tardaba 11 min solo en comparar).
RCLONE_SYNC=(--fast-list)
# De día (8:00–23:00) la subida se limita para no ahogar el internet de la casa.
RCLONE_BW=(--bwlimit "08:00,3M 23:00,off")
IMMICH_LOCK="${BACKUP_IMMICH_LOCK:-/tmp/backup-immich.lock}"
STORAGE_ROOT="${BACKUP_STORAGE_ROOT:-/storage}"

# .env.backup: BACKUP_GPG_PASSPHRASE (obligatoria para los secretos),
# BACKUP_ALERT_URL (opcional). TELEGRAM_* se leen de .env para avisar fallos.
[ -f "$COMPOSE_DIR/.env.backup" ] && source "$COMPOSE_DIR/.env.backup"
env_get() { grep "^$1=" "$COMPOSE_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }

ERRORS=0
FALLOS=""
AVISOS=0
LISTA_AVISOS=""
log()  { echo "$LOG_PREFIX $*"; }
fail() { echo "$LOG_PREFIX ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); FALLOS="$FALLOS\n• $*"; }
# Aviso: algo no crítico falló (p. ej. la retención). Se registra y se notifica,
# pero NO cuenta como error ni cambia el código de salida.
warn() { echo "$LOG_PREFIX AVISO: $*" >&2; AVISOS=$((AVISOS + 1)); LISTA_AVISOS="$LISTA_AVISOS\n• $*"; }

# Telegram. La URL (lleva el token) se pasa a curl por stdin con --config -,
# así nunca aparece en la lista de procesos (`ps`). El texto del mensaje no es secreto.
avisar() {
  local tg_token tg_chat
  tg_token=$(env_get TELEGRAM_BOT_TOKEN)
  tg_chat=$(env_get TELEGRAM_CHAT_ID)
  if [ -n "${BACKUP_TEST_ROOT:-}" ]; then echo "[ENSAYO avisar] $1"; return 0; fi
  [ -n "$tg_token" ] && [ -n "$tg_chat" ] || return 0
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$tg_token" \
    | curl -s -m 15 -o /dev/null --config - \
        --data-urlencode "chat_id=$tg_chat" --data-urlencode "text=$1"
}

# Alerta por umbral de disco de /data: como máximo una vez al día.
alerta_disco() {
  local dir="$LOCAL_BACKUP_ROOT" pct libre
  [ -d "$dir" ] || dir=$(dirname "$dir")
  pct=$(df --output=pcent "$dir" 2>/dev/null | tail -1 | tr -dc '0-9')
  [ -n "$pct" ] || return 0
  if [ "$pct" -ge "$DISK_ALERT_PCT" ]; then
    if [ "$(cat "$DISK_ALERT_STAMP" 2>/dev/null)" = "$(date +%F)" ]; then
      log "Disco $pct% (umbral $DISK_ALERT_PCT%): ya se avisó hoy."
      return 0
    fi
    libre=$(df -h --output=avail "$dir" | tail -1 | tr -d ' ')
    log "AVISO: disco de /data al ${pct}% (umbral ${DISK_ALERT_PCT}%, libre $libre)"
    avisar "$(printf '💾 Disco de /data al %s%% (umbral %s%%), libre %s.\nSnapshots locales: %s' \
      "$pct" "$DISK_ALERT_PCT" "$libre" "$(du -sh "$LOCAL_BACKUP_ROOT/snapshots" 2>/dev/null | cut -f1)")"
    echo "$(date +%F)" > "$DISK_ALERT_STAMP"
  fi
}

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

# tar devuelve 1 ("file changed as we read it", sockets ignorados) cuando un archivo cambia
# mientras se lee: el archivo generado es válido, así que eso no es un fallo. Solo >1 lo es.
# Sin esto, `guardar` descartaba el archivo (Hermes escribe en ~/.hermes mientras se respalda).
tar_tolerante() { tar "$@"; local rc=$?; [ "$rc" -le 1 ]; }

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
step "volumen appflowy (archivos)" guardar "$BACKUP_DIR/appflowy-files.tar.gz" dump_volume appflowy_minio_data
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
  tar_tolerante czf - "${EXCL[@]}" --exclude='.hermes/bin' --exclude='.hermes/logs' --exclude='.hermes/home/.cache' \
    -C "$HOME_DIR" .hermes

# ── Secretos: cifrados ANTES de salir del disco ──────────────────────────────
# GPG simétrico (stdin -> stdout). La frase entra por el descriptor 3 (un pipe
# anónimo creado por el here-string), no por argumento: no sale en `ps`.
# (Un here-string con una frase corta no deja archivo en disco en bash 5.1.)
gpg_cifrar() {
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
      --symmetric --cipher-algo AES256 -o - 3<<<"$BACKUP_GPG_PASSPHRASE"
}
log "Backup cifrado de secretos..."
secretos() {
  local lista
  lista=$( (cd / && find "${HOME_DIR#/}" data -maxdepth 5 -type f -name '.env*' \
      -not -name '*.example' -not -path '*/node_modules/*' -not -path 'data/docker/*' \
      -not -path 'data/containerd/*' -not -path 'data/backups/*' 2>/dev/null) )
  # shellcheck disable=SC2086
  sudo -n tar czf - --ignore-failed-read -C / $lista \
      "${HOME_DIR#/}/.ssh" "${HOME_DIR#/}/.config/rclone" data/stp/secrets \
    | gpg_cifrar
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

# Alerta de disco (una vez al día como máximo)
alerta_disco

# ── Cifrado opcional de lo que sube a Drive (BACKUP_ENCRYPT_UPLOAD=1) ────────
# El snapshot LOCAL se queda en claro (restauración rápida, sin depender de la
# frase). Para Drive se genera un directorio de preparación con cada archivo
# cifrado como <nombre>.gpg (los que ya son .gpg se copian tal cual), se sube
# ese y se borra. Costo: espacio temporal ≈ tamaño del snapshot (~0,45 GB) y
# unos segundos/minutos de CPU (datos ya comprimidos, AES256).
# Restaurar:  gpg --decrypt db-X.sql.gz.gpg > db-X.sql.gz   (pide la frase)
SUBIDA_DIR="$BACKUP_DIR"
STAGE_DIR=""
preparar_cifrado() {
  STAGE_DIR="$LOCAL_BACKUP_ROOT/.stage-$DATE"
  rm -rf "$STAGE_DIR"; mkdir -p "$STAGE_DIR" || return 1
  chmod 700 "$STAGE_DIR"
  local f base
  for f in "$BACKUP_DIR"/*; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    case "$base" in
      *.gpg) cp -p "$f" "$STAGE_DIR/$base" || return 1 ;;
      *)     gpg_cifrar < "$f" > "$STAGE_DIR/$base.gpg.tmp" \
               && mv "$STAGE_DIR/$base.gpg.tmp" "$STAGE_DIR/$base.gpg" || return 1 ;;
    esac
  done
}
if [ "$BACKUP_ENCRYPT_UPLOAD" = "1" ]; then
  if [ -z "${BACKUP_GPG_PASSPHRASE:-}" ]; then
    fail "BACKUP_ENCRYPT_UPLOAD=1 pero falta la frase GPG: no se sube nada sin cifrar"
    SUBIDA_DIR=""
  else
    log "Cifrando snapshot para Drive..."
    if step "cifrado del snapshot para Drive" preparar_cifrado; then
      SUBIDA_DIR="$STAGE_DIR"
    else
      SUBIDA_DIR=""   # nunca caer en subir en claro por un fallo de cifrado
    fi
  fi
fi

log "Subiendo snapshot a Google Drive..."
if [ -n "$SUBIDA_DIR" ]; then
  step "subida del snapshot a Drive" \
    rclone_retry copy "$SUBIDA_DIR" "$RCLONE_REMOTE/snapshots/$DATE/" ${BACKUP_DRY_RUN:+--dry-run}
fi
[ -n "$STAGE_DIR" ] && rm -rf "$STAGE_DIR"

# ── Sync incremental de archivos grandes ─────────────────────────────────────
# Lo que se borra o cambia en el servidor NO se pierde en Drive: va a
# _eliminados/<fecha>/ durante 30 días (protege de un borrado accidental o de
# un ransomware que el sync copiaría tal cual).
# rclone crypt SIN tocar rclone.conf: el remoto "stpcrypt:" se define por variables
# de entorno y sus dos claves (contraseña y sal) se derivan de la misma frase GPG.
# Así una sola frase guardada fuera del servidor basta para restaurar todo.
# Solo se activa para los syncs listados en BACKUP_CRYPT_SYNC.
CRYPT_REMOTE_BASE="$RCLONE_REMOTE/cifrado"
crypt_activo() { case " $BACKUP_CRYPT_SYNC " in *" $1 "*) return 0;; esac; return 1; }
preparar_crypt() {
  [ -n "${BACKUP_GPG_PASSPHRASE:-}" ] || return 1
  export RCLONE_CONFIG_STPCRYPT_TYPE=crypt
  export RCLONE_CONFIG_STPCRYPT_REMOTE="$CRYPT_REMOTE_BASE"
  export RCLONE_CONFIG_STPCRYPT_FILENAME_ENCRYPTION=standard
  RCLONE_CONFIG_STPCRYPT_PASSWORD=$(printf '%s' "${BACKUP_GPG_PASSPHRASE}|crypt-pass" | rclone obscure -) || return 1
  RCLONE_CONFIG_STPCRYPT_PASSWORD2=$(printf '%s' "${BACKUP_GPG_PASSPHRASE}|crypt-salt" | rclone obscure -) || return 1
  export RCLONE_CONFIG_STPCRYPT_PASSWORD RCLONE_CONFIG_STPCRYPT_PASSWORD2
}
sync_seguro() {
  local origen="$1" destino="$2"; shift 2
  local base="$RCLONE_REMOTE"
  if crypt_activo "$destino"; then
    # Si no se puede armar el remoto cifrado, NO se cae a subir en claro: es un fallo.
    preparar_crypt || { echo "$LOG_PREFIX no se pudo preparar rclone crypt para $destino" >&2; return 1; }
    base="stpcrypt:"
    CRYPT_USADO=1
  fi
  rclone_retry sync "$origen" "$base/$destino/"     --backup-dir "$base/_eliminados/$DATE/$destino" "${RCLONE_BW[@]}" "${RCLONE_SYNC[@]}" ${BACKUP_DRY_RUN:+--dry-run} "$@"
}
log "Sync incremental de archivos..."
step "sync de nextcloud"   sync_seguro "$STORAGE_ROOT/nextcloud"   nextcloud
step "sync de erp-uploads" sync_seguro "$STORAGE_ROOT/erp-uploads" erp-uploads
# Immich: originales + respaldos de su base. Las miniaturas y los videos
# recodificados se regeneran solos. El lock evita pisarse con una subida
# larga en curso (la primera son ~140 GB).
immich_sync() {
  exec 9>"$IMMICH_LOCK"
  if ! flock -n 9; then
    log "  sync de Immich omitido: hay una subida de Immich en curso."
    return 0
  fi
  sync_seguro "$STORAGE_ROOT/immich" immich     --exclude 'thumbs/**' --exclude 'encoded-video/**' --transfers 4
  local rc=$?
  flock -u 9
  return $rc
}
step "sync de immich" immich_sync

# ── Retención ────────────────────────────────────────────────────────────────
log "Limpiando antiguos (local >${LOCAL_RETENTION_DAYS}d, Drive >${REMOTE_RETENTION_DAYS}d)..."
# Local: solo carpetas con nombre AAAA-MM-DD, nunca las últimas $LOCAL_KEEP_MIN,
# y NO se borra nada si el backup de hoy tuvo errores (podría ser la única copia buena).
limpiar_local() {
  local d n=0 total
  total=$(find "$LOCAL_BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' | wc -l)
  # Más viejos primero; se salta lo que deba quedar (los últimos LOCAL_KEEP_MIN).
  while IFS= read -r d; do
    n=$((n + 1))
    [ $((total - n)) -lt "$LOCAL_KEEP_MIN" ] && break
    rm -rf -- "$d" || return 1
  done < <(find "$LOCAL_BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' -mtime +$LOCAL_RETENTION_DAYS | sort)
}
if [ "$ERRORS" -eq 0 ]; then
  limpiar_local || warn "falló la limpieza de snapshots locales antiguos"
else
  warn "retención local omitida: el backup de hoy tuvo errores"
fi
# Drive: antes `2>/dev/null || true` escondía los fallos. Ahora se registra la
# salida de rclone y el fallo marca el respaldo "con avisos" (no lo aborta).
retencion_drive() {
  local ruta="$1" salida
  # Si la carpeta aún no existe (nada se ha borrado nunca), `delete` la reintenta
  # 5 veces y da falso aviso: se crea vacía primero (mkdir es idempotente).
  rclone mkdir "$ruta" "${RCLONE_OPTS[@]}" ${BACKUP_DRY_RUN:+--dry-run} >/dev/null 2>&1
  if ! salida=$(rclone delete "$ruta" --min-age ${REMOTE_RETENTION_DAYS}d --rmdirs "${RCLONE_OPTS[@]}" ${BACKUP_DRY_RUN:+--dry-run} 2>&1); then
    echo "$salida" | tail -5 | sed "s/^/$LOG_PREFIX   rclone: /" >&2
    warn "falló la retención en Drive ($ruta)"
    return 1
  fi
}
retencion_drive "$RCLONE_REMOTE/snapshots/"
retencion_drive "$RCLONE_REMOTE/_eliminados/"
[ "${CRYPT_USADO:-0}" = 1 ] && retencion_drive "stpcrypt:_eliminados/"

# ── Resultado ────────────────────────────────────────────────────────────────
ping_alerta() { [ -n "${BACKUP_ALERT_URL:-}" ] && [ -z "${BACKUP_TEST_ROOT:-}" ] && curl -fsS --max-time 15 "$BACKUP_ALERT_URL?status=$1&msg=$2" -o /dev/null 2>/dev/null || true; }
if [ "$ERRORS" -eq 0 ]; then
  if [ "$AVISOS" -eq 0 ]; then
    log "Backup completado."
  else
    log "Backup completado CON $AVISOS AVISO(S) (sin errores)."
    avisar "$(printf "ℹ️ Backup del servidor STP ($DATE) completado con %s aviso(s):%b

Log: ~/stp/logs/backup.log" "$AVISOS" "$LISTA_AVISOS")"
  fi
  ping_alerta up ok
  exit 0
else
  log "Backup TERMINADO CON $ERRORS ERROR(ES) — revisar arriba. La copia local en $BACKUP_DIR se conserva."
  avisar "$(printf "⚠️ Backup del servidor STP ($DATE) terminó con $ERRORS error(es):$FALLOS

Log: ~/stp/logs/backup.log")"
  ping_alerta down "$ERRORS+errores+en+el+backup"
  exit 1
fi
