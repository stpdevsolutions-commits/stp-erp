#!/bin/bash
# Respaldo diario de Red Bendición (Supabase, plan Free sin respaldos propios) -> Google Drive.
# Misma estructura que backup.sh (step/guardar/rclone_retry/avisar/GPG por descriptor).
# Uso:   backup-redbendicion.sh [--ahora] [--dry-run]
#   --ahora    corrida manual (igual que sin argumentos; existe para claridad)
#   --dry-run  solo valida dependencias (docker, imagen, rclone, gdrive, gpg); NO necesita la URL
# Cron (NO activado todavía): 30 2 * * * /home/stp/stp/scripts/backup-redbendicion.sh >> /home/stp/stp/logs/backup-redbendicion.log 2>&1
#
# Qué respalda:
#   - datos (formato custom -Fc) de los esquemas public, auth y storage: db-datos.dump
#   - esquema completo de toda la base (solo estructura, sql.gz): db-esquema.sql.gz
#   - (opcional) listado de objetos del Storage vía API si existen RBN_SUPABASE_URL y
#     RBN_SERVICE_KEY en .env.redbendicion; si no, queda una nota. OJO: lista nombres y
#     tamaños, NO descarga los archivos.
# Destino: gdrive:Respaldos-Red-Bendicion/{diarios,semanales}/<fecha>/
# Retención en Drive: 14 diarios + 8 semanales (los domingos). Local: 7 días en /data/backups/redbendicion.
# Avisos a Telegram SOLO si falla (token/chat de ~/stp/.env, como backup.sh).
# Cifrado GPG de lo que sube: SOLO si BACKUP_ENCRYPT_UPLOAD=1 (en .env.backup), igual que backup.sh.
#   Restaurar un .gpg:  gpg --decrypt archivo.gpg > archivo   (pide la frase)
set -uo pipefail

DATE=$(date +%Y-%m-%d)
HOME_DIR="${RBN_HOME_DIR:-/home/stp}"
COMPOSE_DIR="$HOME_DIR/stp"
ENV_RBN="$COMPOSE_DIR/.env.redbendicion"
LOCAL_ROOT="${RBN_LOCAL_ROOT:-/data/backups/redbendicion}"
BACKUP_DIR="$LOCAL_ROOT/$DATE"
RCLONE_BASE="${RBN_RCLONE_BASE:-gdrive:Respaldos-Red-Bendicion}"
PG_IMAGE="${RBN_PG_IMAGE:-postgres:17-alpine}"   # pg_dump 17 sirve para servidores 15/16/17; si Supabase fuese 18+, subir la imagen
LOCAL_RETENTION_DAYS=7
DAILY_KEEP_DAYS=14
WEEKLY_KEEP_DAYS=56
MIN_DUMP_BYTES=20000
LOG_PREFIX="[backup-redbendicion $DATE]"
RCLONE_OPTS=(--retries 5 --retries-sleep 30s --low-level-retries 20 --tpslimit 4 --log-level INFO)
BACKUP_ENCRYPT_UPLOAD=0
DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --ahora) ;;
    -h|--help) sed -n 2,8p "$0"; exit 0 ;;
    *) echo "Argumento desconocido: $a" >&2; exit 2 ;;
  esac
done

[ -f "$COMPOSE_DIR/.env.backup" ] && source "$COMPOSE_DIR/.env.backup"
env_get() { grep "^$1=" "$COMPOSE_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }

ERRORS=0; FALLOS=""
log()  { echo "$LOG_PREFIX $*"; }
fail() { echo "$LOG_PREFIX ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); FALLOS="$FALLOS\n• $*"; }
avisar() {
  local tg_token tg_chat
  tg_token=$(env_get TELEGRAM_BOT_TOKEN); tg_chat=$(env_get TELEGRAM_CHAT_ID)
  [ -n "$tg_token" ] && [ -n "$tg_chat" ] || return 0
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$tg_token" \
    | curl -s -m 15 -o /dev/null --config - \
        --data-urlencode "chat_id=$tg_chat" --data-urlencode "text=$1"
}
step() { local d="$1"; shift; if ! "$@"; then fail "$d"; return 1; fi; }
guardar() {
  local out="$1"; shift
  if "$@" > "$out.tmp"; then mv "$out.tmp" "$out"; else rm -f "$out.tmp"; return 1; fi
}
rclone_retry() {
  local attempt=1 max=4 wait=60
  while true; do
    rclone "$@" "${RCLONE_OPTS[@]}" && return 0
    [ "$attempt" -ge "$max" ] && return 1
    log "  rclone falló (intento $attempt/$max) — reintentando en ${wait}s..."
    sleep "$wait"; attempt=$((attempt + 1)); wait=$((wait * 2))
  done
}
# Copia a Drive sin subir temporales (.tmp) a medias.
subir() { rclone_retry copy "$1" "$2" --exclude '*.tmp'; }
gpg_cifrar() {
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
      --symmetric --cipher-algo AES256 -o - 3<<<"$BACKUP_GPG_PASSPHRASE"
}

# ── Dependencias ─────────────────────────────────────────────────────────────
dependencias() {
  local ok=0
  command -v docker >/dev/null || { echo "$LOG_PREFIX falta docker" >&2; ok=1; }
  command -v rclone >/dev/null || { echo "$LOG_PREFIX falta rclone" >&2; ok=1; }
  command -v curl   >/dev/null || { echo "$LOG_PREFIX falta curl" >&2; ok=1; }
  if [ "$BACKUP_ENCRYPT_UPLOAD" = "1" ]; then
    command -v gpg >/dev/null || { echo "$LOG_PREFIX falta gpg (BACKUP_ENCRYPT_UPLOAD=1)" >&2; ok=1; }
    [ -n "${BACKUP_GPG_PASSPHRASE:-}" ] || { echo "$LOG_PREFIX falta BACKUP_GPG_PASSPHRASE en .env.backup" >&2; ok=1; }
  fi
  if [ "$ok" -eq 0 ]; then
    docker image inspect "$PG_IMAGE" >/dev/null 2>&1 || {
      if [ "$DRY" -eq 1 ]; then log "imagen $PG_IMAGE NO descargada aún (se descargará: docker pull $PG_IMAGE)"
      else log "Descargando $PG_IMAGE..."; docker pull -q "$PG_IMAGE" >/dev/null || ok=1; fi; }
  fi
  if [ "$ok" -eq 0 ]; then
    timeout 60 rclone about gdrive: >/dev/null 2>&1 || { echo "$LOG_PREFIX rclone no alcanza gdrive:" >&2; ok=1; }
  fi
  return $ok
}

if [ "$DRY" -eq 1 ]; then
  if dependencias; then
    log "DRY-RUN: dependencias OK (docker, rclone, gdrive:$( [ "$BACKUP_ENCRYPT_UPLOAD" = 1 ] && echo ', gpg')). Imagen: $PG_IMAGE. Destino: $RCLONE_BASE"
  else
    log "DRY-RUN: faltan dependencias (ver arriba)"; exit 1
  fi
  if [ -f "$ENV_RBN" ] && grep -q '^RBN_DB_URL=.\+' "$ENV_RBN"; then log "DRY-RUN: $ENV_RBN tiene RBN_DB_URL."
  else log "DRY-RUN: todavía NO hay RBN_DB_URL (corre ~/stp/scripts/rbn-guardar-url.sh)."; fi
  exit 0
fi

# Una sola corrida a la vez (dos en paralelo se pisan los archivos .tmp).
exec 8>"${RBN_LOCK:-/tmp/backup-redbendicion.lock}"
flock -n 8 || { echo "$LOG_PREFIX Ya hay otra corrida en curso; no se hace nada." >&2; exit 3; }

# ── URL de la base (sin ella, salir con mensaje claro y sin tocar nada) ──────
if [ ! -f "$ENV_RBN" ] || ! grep -q '^RBN_DB_URL=.\+' "$ENV_RBN"; then
  echo "$LOG_PREFIX Falta RBN_DB_URL en $ENV_RBN." >&2
  echo "$LOG_PREFIX 1) Restablece la contraseña en Supabase (Project Settings > Database)." >&2
  echo "$LOG_PREFIX 2) Corre ~/stp/scripts/rbn-guardar-url.sh y pégala cuando la pida." >&2
  echo "$LOG_PREFIX No se hizo nada." >&2
  exit 2
fi
RBN_DB_URL=$(grep '^RBN_DB_URL=' "$ENV_RBN" | head -1 | cut -d= -f2-)
RBN_SUPABASE_URL=$(grep '^RBN_SUPABASE_URL=' "$ENV_RBN" | head -1 | cut -d= -f2-)
RBN_SERVICE_KEY=$(grep '^RBN_SERVICE_KEY=' "$ENV_RBN" | head -1 | cut -d= -f2-)
export RBN_DB_URL   # se pasa al contenedor con -e RBN_DB_URL (sin valor): no aparece en `ps`

log "Iniciando respaldo de Red Bendición..."
if ! dependencias; then fail "dependencias incompletas"; avisar "$(printf '⚠️ Respaldo Red Bendición (%s) falló: dependencias incompletas.\nLog: ~/stp/logs/backup-redbendicion.log' "$DATE")"; exit 1; fi
umask 077
mkdir -p "$BACKUP_DIR" || { fail "no se pudo crear $BACKUP_DIR"; exit 1; }

pgrun() { docker run --rm -e RBN_DB_URL --network host "$@"; }

# Versión del servidor (informativa; si pg_dump es más viejo que el servidor, el dump falla y se avisa)
SRV_VER=$(pgrun "$PG_IMAGE" sh -c 'psql "$RBN_DB_URL" -Atc "show server_version"' 2>/dev/null || true)
[ -n "$SRV_VER" ] && log "Servidor Postgres: $SRV_VER (cliente: $PG_IMAGE)" || fail "no se pudo conectar a la base (¿URL/contraseña/host del pooler? prueba aws-1-us-east-1 en lugar de aws-0)"

if [ "$ERRORS" -eq 0 ]; then
  dump_datos()   { pgrun "$PG_IMAGE" sh -c 'pg_dump "$RBN_DB_URL" -Fc --no-owner --no-privileges -n public -n private -n auth -n storage'; }
  dump_esquema() { pgrun "$PG_IMAGE" sh -c 'pg_dump "$RBN_DB_URL" --schema-only --no-owner --no-privileges' | gzip; }
  step "dump de datos (public, auth, storage)" guardar "$BACKUP_DIR/db-datos.dump" dump_datos
  step "dump del esquema completo"             guardar "$BACKUP_DIR/db-esquema.sql.gz" dump_esquema
fi

# ── Verificación ─────────────────────────────────────────────────────────────
if [ -f "$BACKUP_DIR/db-datos.dump" ]; then
  sz=$(stat -c %s "$BACKUP_DIR/db-datos.dump")
  [ "$sz" -ge "$MIN_DUMP_BYTES" ] || fail "db-datos.dump sospechosamente pequeño ($sz bytes)"
  n=$(docker run --rm -i "$PG_IMAGE" pg_restore -l < "$BACKUP_DIR/db-datos.dump" 2>/dev/null | grep -c 'TABLE DATA')
  [ "${n:-0}" -ge 1 ] || fail "pg_restore -l no lista ninguna tabla con datos"
  log "Verificado: db-datos.dump $sz bytes, $n tablas con datos."
fi
if [ -f "$BACKUP_DIR/db-esquema.sql.gz" ]; then
  gzip -t "$BACKUP_DIR/db-esquema.sql.gz" 2>/dev/null || fail "db-esquema.sql.gz corrupto"
  [ "$(stat -c %s "$BACKUP_DIR/db-esquema.sql.gz")" -ge 2000 ] || fail "db-esquema.sql.gz sospechosamente pequeño"
fi

# ── Listado de Storage (opcional) ────────────────────────────────────────────
listar_storage() {
  RBN_SUPABASE_URL="$RBN_SUPABASE_URL" RBN_SERVICE_KEY="$RBN_SERVICE_KEY" python3 - <<'PY'
import json, os, urllib.request
base = os.environ["RBN_SUPABASE_URL"].rstrip("/") + "/storage/v1"
key = os.environ["RBN_SERVICE_KEY"]
def call(path, body=None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))
def walk(bucket, prefix=""):
    off = 0
    while True:
        items = call("/object/list/" + bucket, {"prefix": prefix, "limit": 1000, "offset": off})
        for it in items:
            if it.get("id") is None:  # carpeta
                yield from walk(bucket, prefix + it["name"] + "/")
            else:
                yield {"bucket": bucket, "name": prefix + it["name"], "size": (it.get("metadata") or {}).get("size")}
        if len(items) < 1000: break
        off += 1000
out = [o for b in call("/bucket") for o in walk(b["name"])]
print(json.dumps(out, indent=1))
PY
}
if [ -n "$RBN_SUPABASE_URL" ] && [ -n "$RBN_SERVICE_KEY" ]; then
  step "listado de objetos de Storage" guardar "$BACKUP_DIR/storage-objetos.json" listar_storage
else
  echo "Listado de Storage NO incluido: añade RBN_SUPABASE_URL y RBN_SERVICE_KEY a $ENV_RBN para activarlo. (Solo lista nombres/tamaños; los archivos no se descargan.)" > "$BACKUP_DIR/NOTA-storage.txt"
  log "Storage: sin RBN_SERVICE_KEY, solo nota."
fi

# ── Subida a Drive ───────────────────────────────────────────────────────────
SUBIDA_DIR="$BACKUP_DIR"; STAGE_DIR=""
preparar_cifrado() {
  STAGE_DIR="$LOCAL_ROOT/.stage-$DATE"; rm -rf "$STAGE_DIR"; mkdir -p "$STAGE_DIR" && chmod 700 "$STAGE_DIR" || return 1
  local f b
  for f in "$BACKUP_DIR"/*; do
    [ -f "$f" ] || continue; b=$(basename "$f")
    gpg_cifrar < "$f" > "$STAGE_DIR/$b.gpg.tmp" && mv "$STAGE_DIR/$b.gpg.tmp" "$STAGE_DIR/$b.gpg" || return 1
  done
}
if [ "$BACKUP_ENCRYPT_UPLOAD" = "1" ]; then
  if step "cifrado para Drive" preparar_cifrado; then SUBIDA_DIR="$STAGE_DIR"; else SUBIDA_DIR=""; fi  # nunca subir en claro tras fallo
fi

if [ "$ERRORS" -eq 0 ] && [ -n "$SUBIDA_DIR" ]; then
  step "subida a Drive (diarios)" subir "$SUBIDA_DIR" "$RCLONE_BASE/diarios/$DATE"
  if [ "$(date +%u)" = "7" ]; then
    step "copia semanal en Drive" subir "$SUBIDA_DIR" "$RCLONE_BASE/semanales/$DATE"
  fi
elif [ "$ERRORS" -ne 0 ]; then
  log "Hubo errores: no se sube nada a Drive."
fi
[ -n "$STAGE_DIR" ] && rm -rf "$STAGE_DIR"

# ── Retención ────────────────────────────────────────────────────────────────
if [ "$ERRORS" -eq 0 ]; then
  find "$LOCAL_ROOT" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' -mtime +$LOCAL_RETENTION_DAYS -exec rm -rf -- {} + 2>/dev/null
  for par in "diarios:$DAILY_KEEP_DAYS" "semanales:$WEEKLY_KEEP_DAYS"; do
    rclone mkdir "$RCLONE_BASE/${par%%:*}" "${RCLONE_OPTS[@]}" >/dev/null 2>&1
    rclone delete "$RCLONE_BASE/${par%%:*}" --min-age ${par##*:}d --rmdirs "${RCLONE_OPTS[@]}" >/dev/null 2>&1 \
      || echo "$LOG_PREFIX AVISO: falló la retención en ${par%%:*}" >&2
  done
fi

# ── Resultado ────────────────────────────────────────────────────────────────
if [ "$ERRORS" -eq 0 ]; then
  log "Respaldo completado ($(du -sh "$BACKUP_DIR" | cut -f1))."
  exit 0
else
  log "Respaldo TERMINADO CON $ERRORS ERROR(ES). Copia local en $BACKUP_DIR."
  avisar "$(printf "⚠️ Respaldo de Red Bendición (%s) falló con %s error(es):%b\n\nLog: ~/stp/logs/backup-redbendicion.log" "$DATE" "$ERRORS" "$FALLOS")"
  exit 1
fi
