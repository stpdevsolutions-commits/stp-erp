#!/bin/bash
# Actualiza Immich UNA sola vez, justo después del respaldo nocturno.
#   immich-update.sh            -> espera al respaldo, comprueba y actualiza (lo lanza cron)
#   immich-update.sh --dry-run  -> solo comprueba (respaldo, versión actual, existencia de las imágenes); no toca nada
# Se elimina solo del cron al terminar (con éxito o con fallo; si falla, avisa por Telegram y no hace rollback).
set -u

VERSION_OBJETIVO="v3.3.1"
COMPOSE_DIR="$HOME/stp/immich"
SNAP_ROOT="/data/backups/snapshots"
ENV_STP="$HOME/stp/.env"
LOG="$HOME/stp/logs/immich-update.log"
ESPERA_MAX=$((3 * 3600))        # máximo que se espera a que termine el respaldo
DUMP_MIN_BYTES=50000000         # el volcado de Immich pesa ~200 MB; menos de 50 MB es sospechoso
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

log() { echo "[immich-update $(date -u '+%F %T')] $*" | tee -a "$LOG"; }
env_get() { grep "^$1=" "$ENV_STP" 2>/dev/null | head -1 | cut -d= -f2-; }
aviso() {
  local tok chat; tok=$(env_get TELEGRAM_BOT_TOKEN); chat=$(env_get TELEGRAM_CHAT_ID)
  [ "$DRY" = 1 ] && { log "(dry-run) aviso: $1"; return; }
  [ -n "$tok" ] && [ -n "$chat" ] && curl -s -m 15 -o /dev/null "https://api.telegram.org/bot$tok/sendMessage" \
    --data-urlencode "chat_id=$chat" --data-urlencode "text=$1"
}
version_api() {
  docker run --rm --network stp_stp-network curlimages/curl -s -m 10 http://immich-server:2283/api/server/version 2>/dev/null \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("v%d.%d.%d" % (d["major"], d["minor"], d["patch"]))' 2>/dev/null
}
quitar_cron() {
  [ "$DRY" = 1 ] && return
  crontab -l 2>/dev/null | grep -v 'immich-update.sh' | crontab -
  log "tarea retirada del cron"
}
salir() { quitar_cron; exit "${1:-0}"; }
fallo() { log "FALLO: $1"; aviso "❌ Actualización de Immich a $VERSION_OBJETIVO: $1"; salir 1; }

log "inicio (objetivo $VERSION_OBJETIVO, dry-run=$DRY)"

# 1. Esperar a que termine el respaldo
if [ "$DRY" = 0 ]; then
  t0=$(date +%s)
  while pgrep -f 'scripts/backup.sh' >/dev/null 2>&1 || [ -e /tmp/backup-immich.lock ]; do
    [ $(( $(date +%s) - t0 )) -gt "$ESPERA_MAX" ] && fallo "el respaldo seguía corriendo tras 3 h; no se actualizó nada"
    sleep 60
  done
  log "respaldo terminado"
fi

# 2. El respaldo de Immich debe estar completo
SNAP="$SNAP_ROOT/$(date -u +%F)"
[ "$DRY" = 1 ] && SNAP=$(ls -1d "$SNAP_ROOT"/*/ 2>/dev/null | sort | tail -1 | sed 's:/$::')
DUMP="$SNAP/db-immich_postgres.sql.gz"
[ -s "$DUMP" ] || fallo "no existe el volcado de la base de Immich en $SNAP"
TAM=$(stat -c %s "$DUMP"); [ "$TAM" -ge "$DUMP_MIN_BYTES" ] || fallo "el volcado de Immich pesa solo $TAM bytes (mínimo $DUMP_MIN_BYTES)"
if [ "$DRY" = 0 ]; then
  EDAD=$(( $(date +%s) - $(stat -c %Y "$DUMP") ))
  [ "$EDAD" -le 21600 ] || fallo "el volcado de Immich es de hace $((EDAD / 3600)) h (no es de esta noche)"
fi
gzip -t "$DUMP" 2>/dev/null || fallo "el volcado de Immich está corrupto (gzip -t falló)"
log "respaldo OK: $DUMP ($((TAM / 1000000)) MB)"

# 3. Versión actual
ACTUAL=$(version_api)
[ -n "$ACTUAL" ] || fallo "no se pudo leer la versión actual de Immich (¿está caído?)"
log "versión actual: $ACTUAL"
if [ "$ACTUAL" = "$VERSION_OBJETIVO" ]; then
  log "ya está en $VERSION_OBJETIVO; nada que hacer"; aviso "ℹ️ Immich ya estaba en $VERSION_OBJETIVO."; salir 0
fi

# 4. Las imágenes de la versión objetivo deben existir
for img in immich-server immich-machine-learning; do
  docker buildx imagetools inspect "ghcr.io/immich-app/$img:$VERSION_OBJETIVO" >/dev/null 2>&1 \
    || fallo "no existe la imagen ghcr.io/immich-app/$img:$VERSION_OBJETIVO"
done
log "imágenes de $VERSION_OBJETIVO disponibles"

if [ "$DRY" = 1 ]; then
  log "(dry-run) todo correcto: se actualizaría de $ACTUAL a $VERSION_OBJETIVO"; exit 0
fi

# 5. Fijar la versión, descargar y reiniciar solo Immich
cd "$COMPOSE_DIR" || fallo "no existe $COMPOSE_DIR"
cp .env ".env.antes-update-$(date -u +%Y%m%d)"
sed -i "s/^IMMICH_VERSION=.*/IMMICH_VERSION=$VERSION_OBJETIVO/" .env
grep -q "^IMMICH_VERSION=$VERSION_OBJETIVO" .env || fallo "no se pudo fijar IMMICH_VERSION en .env"
if ! docker compose pull >>"$LOG" 2>&1; then
  cp ".env.antes-update-$(date -u +%Y%m%d)" .env
  fallo "no se pudieron descargar las imágenes; se restauró el .env anterior"
fi
log "imágenes descargadas; reiniciando Immich"
docker compose up -d 2>&1 | grep -v 'level=warning' | tee -a "$LOG" | tail -5

# 6. Esperar a que quede sano y en la versión nueva (máx. 10 min)
for i in $(seq 1 60); do
  sleep 10
  V=$(version_api)
  S=$(docker inspect immich_server --format '{{.State.Health.Status}}' 2>/dev/null)
  [ "$V" = "$VERSION_OBJETIVO" ] && [ "$S" = "healthy" ] && break
done
V=$(version_api)
if [ "$V" = "$VERSION_OBJETIVO" ]; then
  log "ÉXITO: Immich $ACTUAL -> $V"
  aviso "✅ Immich actualizado de $ACTUAL a $V. Respaldo previo: $DUMP"
  salir 0
fi
fallo "tras reiniciar, la versión es '${V:-sin respuesta}' (esperada $VERSION_OBJETIVO). No se hizo rollback automático. Revisa 'docker logs immich_server'. Respaldo de la base: $DUMP. El .env anterior está en $COMPOSE_DIR/.env.antes-update-*"
