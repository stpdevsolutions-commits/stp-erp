#!/bin/bash
# Watchdog externo — corre en Oracle Cloud VM, chequea un servicio publico
# real de stp-server (NO la landing, que vive en Vercel y seguiria arriba
# aunque el servidor se apague por completo) desde fuera de la
# oficina/energia local. Alerta por Telegram + email en transiciones down<->up.
#
# INF-3: URL cambiada a Mi Dia (corre en stp-server), umbral 3, reintentos,
# diagnostico por fallo (codigo HTTP, tiempo, cf-ray) y modo LOG_ONLY.
#   LOG_ONLY=1 (por defecto): NO envia Telegram ni correo; solo escribe
#                             "WOULD ALERT: DOWN/RECOVERED" en el log.
#   LOG_ONLY=0              : se comporta como el original (envia alertas).

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$DIR/.env" ] && source "$DIR/.env"

# Las variables pueden sobreescribirse desde el entorno (usado en pruebas).
STATE_FILE="${STATE_FILE:-$DIR/state}"
DOWN_SINCE_FILE="${DOWN_SINCE_FILE:-$DIR/down_since}"
LOG_FILE="${LOG_FILE:-$DIR/watchdog.log}"
URL="${URL:-https://dia.stpsoluciones.com/}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
TIMEOUT="${TIMEOUT:-10}"
LOG_ONLY="${LOG_ONLY:-1}"

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "parse_mode=HTML" \
    --data-urlencode "text=$1" >/dev/null
}

send_email() {
  local subject="$1"
  local html="${2//$'\n'/<br>}"
  [ -z "${RESEND_API_KEY:-}" ] && return
  curl -s -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"${ALERT_FROM_EMAIL}\",\"to\":\"${ALERT_TO_EMAIL}\",\"subject\":\"${subject}\",\"html\":\"${html}\"}" >/dev/null
}

[ -f "$STATE_FILE" ] || echo "up 0" > "$STATE_FILE"
read -r prev_status fail_count < "$STATE_FILE"

now=$(date '+%Y-%m-%d %H:%M:%S')

# Chequeo: exito = codigo HTTP 2xx/3xx (sin -f; se evalua el codigo a mano).
HDR=$(mktemp)
trap 'rm -f "$HDR"' EXIT
w=$(curl -s -o /dev/null -D "$HDR" -m "$TIMEOUT" --retry 2 --retry-delay 5 \
  -w '%{http_code} %{time_total} %{time_appconnect}' "$URL")
curl_rc=$?
read -r code ttotal tls <<< "$w"
code="${code:-000}"

ok=0
case "$code" in
  2??|3??) ok=1 ;;
esac

if [ "$ok" = "1" ]; then
  [ "$LOG_ONLY" = "1" ] && echo "$now OK code=$code time=${ttotal}s url=$URL" >> "$LOG_FILE"
  if [ "$prev_status" = "down" ]; then
    down_since=$(cat "$DOWN_SINCE_FILE" 2>/dev/null || date +%s)
    mins=$(( ($(date +%s) - down_since) / 60 ))
    if [ "$LOG_ONLY" = "1" ]; then
      echo "$now WOULD ALERT: RECOVERED after ~${mins}min" >> "$LOG_FILE"
    else
      msg=$(printf '🟢 <b>Servidor STP respondió de nuevo</b>\n🖥️ Detectado por monitor externo (Oracle Cloud)\n⏰ Hora: %s\n⏱️ Estuvo caído ~%s min' "$now" "$mins")
      send_telegram "$msg"
      send_email "🟢 Servidor STP recuperado" "$msg"
      echo "$now RECOVERED after ~${mins}min" >> "$LOG_FILE"
    fi
    rm -f "$DOWN_SINCE_FILE"
  fi
  echo "up 0" > "$STATE_FILE"
else
  # Diagnostico del fallo
  cfray=$(grep -i '^cf-ray:' "$HDR" 2>/dev/null | tail -1 | cut -d: -f2- | tr -d ' \r\n')
  cfray="${cfray:--}"
  tls_ok=0
  [ -n "$tls" ] && [ "$tls" != "0.000000" ] && [ "$tls" != "0" ] && tls_ok=1
  case "$code" in
    403|1020)
      cls="posible bloqueo de Cloudflare" ;;
    530|1033|502|504)
      cls="tunel o servidor caido" ;;
    000)
      if [ "$curl_rc" = "28" ] && [ "$tls_ok" = "1" ]; then
        cls="posible bloqueo de Cloudflare (timeout con TLS correcto)"
      elif [ "$curl_rc" = "28" ]; then
        cls="timeout sin TLS (red o servidor caido)"
      else
        cls="sin respuesta (curl rc=$curl_rc)"
      fi ;;
    *)
      cls="otro" ;;
  esac
  echo "$now FAIL code=$code time=${ttotal}s curl_rc=$curl_rc tls=$tls_ok cf-ray=$cfray class=\"$cls\" url=$URL" >> "$LOG_FILE"

  fail_count=$((fail_count + 1))
  if [ "$fail_count" -ge "$FAIL_THRESHOLD" ] && [ "$prev_status" != "down" ]; then
    date +%s > "$DOWN_SINCE_FILE"
    if [ "$LOG_ONLY" = "1" ]; then
      echo "$now WOULD ALERT: DOWN (fail_count=$fail_count code=$code cf-ray=$cfray class=\"$cls\")" >> "$LOG_FILE"
    else
      msg=$(printf '🔴 <b>Servidor STP no responde</b>\n🖥️ Detectado por monitor externo (Oracle Cloud)\n⏰ Hora: %s\n🔎 %s no responde tras %s intentos (HTTP %s, cf-ray %s)' "$now" "$URL" "$fail_count" "$code" "$cfray")
      send_telegram "$msg"
      send_email "🔴 Servidor STP no responde" "$msg"
      echo "$now DOWN detected (fail_count=$fail_count)" >> "$LOG_FILE"
    fi
    echo "down $fail_count" > "$STATE_FILE"
  else
    echo "$prev_status $fail_count" > "$STATE_FILE"
  fi
fi
