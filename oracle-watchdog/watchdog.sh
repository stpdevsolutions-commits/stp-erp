#!/bin/bash
# Watchdog externo — corre en Oracle Cloud VM, chequea la landing pública de STP
# desde fuera de la oficina/energía local. Alerta por Telegram + email en transiciones down<->up.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/.env"

STATE_FILE="$DIR/state"
DOWN_SINCE_FILE="$DIR/down_since"
LOG_FILE="$DIR/watchdog.log"
URL="https://stpsoluciones.com"
FAIL_THRESHOLD=2
TIMEOUT=10

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

if curl -sf -o /dev/null -m "$TIMEOUT" "$URL"; then
  if [ "$prev_status" = "down" ]; then
    down_since=$(cat "$DOWN_SINCE_FILE" 2>/dev/null || date +%s)
    mins=$(( ($(date +%s) - down_since) / 60 ))
    msg=$(printf '🟢 <b>Servidor STP respondió de nuevo</b>\n🖥️ Detectado por monitor externo (Oracle Cloud)\n⏰ Hora: %s\n⏱️ Estuvo caído ~%s min' "$now" "$mins")
    send_telegram "$msg"
    send_email "🟢 Servidor STP recuperado" "$msg"
    echo "$now RECOVERED after ~${mins}min" >> "$LOG_FILE"
    rm -f "$DOWN_SINCE_FILE"
  fi
  echo "up 0" > "$STATE_FILE"
else
  fail_count=$((fail_count + 1))
  if [ "$fail_count" -ge "$FAIL_THRESHOLD" ] && [ "$prev_status" != "down" ]; then
    date +%s > "$DOWN_SINCE_FILE"
    msg=$(printf '🔴 <b>Servidor STP no responde</b>\n🖥️ Detectado por monitor externo (Oracle Cloud)\n⏰ Hora: %s\n🔎 %s no responde tras %s intentos' "$now" "$URL" "$fail_count")
    send_telegram "$msg"
    send_email "🔴 Servidor STP no responde" "$msg"
    echo "$now DOWN detected (fail_count=$fail_count)" >> "$LOG_FILE"
    echo "down $fail_count" > "$STATE_FILE"
  else
    echo "$prev_status $fail_count" > "$STATE_FILE"
  fi
fi
