#!/bin/bash
# DNS dinámico para los registros PÚBLICOS de stpsoluciones.com que apuntan a
# la casa donde está el servidor (proxied por Cloudflare). El proveedor de internet cambia la IP
# pública sin avisar — el 2026-09-24 cambió y Mi Día / eCF quedaron con 522
# hasta que alguien lo notó. (Este repo es público: no anotar IPs aquí.)
#
# Cron cada 5 min. Solo toca los registros de REGISTROS, y solo si su IP
# difiere de la pública actual; avisa por Telegram cuando cambia algo.
# Los subdominios internos (erp, api, ...) no están aquí a propósito: se
# resuelven por AdGuard dentro de la VPN, no por Cloudflare.
set -u

ENV_FILE=/home/stp/stp/.env
ZONE_ID=5c2f5ed13b47fed2306bb8d6eaabc544
REGISTROS="dia.stpsoluciones.com ecf.stpsoluciones.com ecf-api.stpsoluciones.com"

env_get() { grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
log() { echo "$(date '+%F %T') $*"; }
es_ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }

TOKEN=$(env_get CF_DNS_API_TOKEN)
if [ -z "$TOKEN" ]; then log "ERROR: falta CF_DNS_API_TOKEN en $ENV_FILE"; exit 1; fi

# IP pública actual, con un segundo servicio por si el primero falla.
IP=$(curl -s -m 10 https://api.ipify.org | tr -d '[:space:]')
es_ipv4 "$IP" || IP=$(curl -s -m 10 https://ipv4.icanhazip.com | tr -d '[:space:]')
if ! es_ipv4 "$IP"; then log "ERROR: no se pudo obtener la IP pública (sin internet?)"; exit 1; fi

API="https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records"
CAMBIOS=""

for NOMBRE in $REGISTROS; do
  RESP=$(curl -s -m 15 -H "Authorization: Bearer $TOKEN" "$API?type=A&name=$NOMBRE")
  # "id ip" del registro, o vacío si no existe / error.
  DATOS=$(printf '%s' "$RESP" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    r = d["result"][0] if d.get("success") and d.get("result") else None
    print(r["id"] + " " + r["content"] if r else "")
except Exception:
    print("")
' 2>/dev/null)
  if [ -z "$DATOS" ]; then log "AVISO: no se pudo leer el registro $NOMBRE"; continue; fi
  ID=${DATOS%% *}
  ACTUAL=${DATOS#* }
  [ "$ACTUAL" = "$IP" ] && continue

  OK=$(curl -s -m 15 -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data "{\"content\":\"$IP\"}" "$API/$ID" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("success"))' 2>/dev/null)
  if [ "$OK" = "True" ]; then
    log "CAMBIO: $NOMBRE $ACTUAL -> $IP"
    CAMBIOS="$CAMBIOS\n• $NOMBRE: $ACTUAL → $IP"
  else
    log "ERROR: no se pudo actualizar $NOMBRE ($ACTUAL -> $IP)"
    CAMBIOS="$CAMBIOS\n• ❌ $NOMBRE: falló la actualización ($ACTUAL → $IP)"
  fi
done

if [ -n "$CAMBIOS" ]; then
  TG_TOKEN=$(env_get TELEGRAM_BOT_TOKEN)
  TG_CHAT=$(env_get TELEGRAM_CHAT_ID)
  if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
    MSG=$(printf "🌐 Cambió la IP pública de la casa (servidor STP).\nRegistros de Cloudflare actualizados:$CAMBIOS")
    curl -s -m 15 -o /dev/null "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      --data-urlencode "chat_id=$TG_CHAT" --data-urlencode "text=$MSG"
  fi
fi
