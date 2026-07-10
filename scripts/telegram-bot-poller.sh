#!/bin/bash
# telegram-bot-poller.sh — Escucha los botones "Aprobar/Rechazar" que manda
# nextcloud-account-gate.sh y ejecuta la aprobación sin necesitar SSH.
# Solo acepta callbacks que lleguen al chat autorizado (TELEGRAM_CHAT_ID de Vigía).
# Corre como servicio systemd persistente (long polling en loop, no cron) para
# que aprobar sea casi instantáneo. flock evita que arranque una segunda copia.
# Servicio: systemctl status telegram-bot-poller
set -uo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK_FILE="$SCRIPTS_DIR/.telegram-poller.lock"
OFFSET_FILE="$SCRIPTS_DIR/.telegram-poller-offset"
PENDING_FILE="$SCRIPTS_DIR/.nextcloud-gate-pending"
NEXTCLOUD_CONTAINER=stp-nextcloud
VIGIA_CONTAINER=vigia-backend

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "$(date -Iseconds) ya hay una instancia corriendo, salgo"; exit 0; }

touch "$OFFSET_FILE" "$PENDING_FILE"

TELEGRAM_BOT_TOKEN=$(docker exec "$VIGIA_CONTAINER" printenv TELEGRAM_BOT_TOKEN)
TELEGRAM_CHAT_ID=$(docker exec "$VIGIA_CONTAINER" printenv TELEGRAM_CHAT_ID)
API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

answer_callback() {
  local callback_id="$1" text="$2" resp
  resp=$(curl -s --max-time 10 -X POST "${API}/answerCallbackQuery" \
    --data-urlencode "callback_query_id=${callback_id}" \
    --data-urlencode "text=${text}")
  if [ "$(echo "$resp" | jq -r '.ok // false' 2>/dev/null)" != "true" ]; then
    echo "$(date -Iseconds) ERROR answerCallbackQuery falló: ${resp:-sin respuesta}" >&2
  fi
}

edit_message() {
  local chat_id="$1" message_id="$2" text="$3" resp
  resp=$(curl -s --max-time 10 -X POST "${API}/editMessageText" \
    --data-urlencode "chat_id=${chat_id}" \
    --data-urlencode "message_id=${message_id}" \
    --data-urlencode "text=${text}")
  if [ "$(echo "$resp" | jq -r '.ok // false' 2>/dev/null)" != "true" ] \
     && ! echo "$resp" | jq -e '(.description // "") | test("message is not modified")' >/dev/null 2>&1; then
    echo "$(date -Iseconds) ERROR editMessageText falló: ${resp:-sin respuesta}" >&2
  fi
}

echo "$(date -Iseconds) telegram-bot-poller arrancando"

while true; do
  OFFSET=$(cat "$OFFSET_FILE" 2>/dev/null || echo "")

  UPDATES=$(curl -s --max-time 20 --keepalive-time 5 -G "${API}/getUpdates" \
    --data-urlencode "timeout=15" \
    --data-urlencode "allowed_updates=[\"callback_query\"]" \
    ${OFFSET:+--data-urlencode "offset=${OFFSET}"})

  if [ -z "$UPDATES" ] || ! echo "$UPDATES" | jq -e . >/dev/null 2>&1; then
    echo "$(date -Iseconds) respuesta inválida de Telegram, reintento en 5s"
    sleep 5
    continue
  fi

  if [ "$(echo "$UPDATES" | jq -r '.ok')" != "true" ]; then
    echo "$(date -Iseconds) getUpdates devolvió error: $UPDATES"
    sleep 5
    continue
  fi

  echo "$UPDATES" | jq -c '.result[]?' | while read -r update; do
    update_id=$(echo "$update" | jq -r '.update_id')
    echo "$((update_id + 1))" > "$OFFSET_FILE"

    cq=$(echo "$update" | jq -c '.callback_query? // empty')
    [ -z "$cq" ] && continue

    callback_id=$(echo "$cq" | jq -r '.id')
    data=$(echo "$cq" | jq -r '.data')
    chat_id=$(echo "$cq" | jq -r '.message.chat.id')
    message_id=$(echo "$cq" | jq -r '.message.message_id')

    if [ "$chat_id" != "$TELEGRAM_CHAT_ID" ]; then
      echo "$(date -Iseconds) callback de chat no autorizado: $chat_id — ignorado"
      answer_callback "$callback_id" "No autorizado"
      continue
    fi

    action="${data%%:*}"
    short_id="${data#*:}"

    entry=$(grep -P "^${short_id}\t" "$PENDING_FILE" || true)
    if [ -z "$entry" ]; then
      edit_message "$chat_id" "$message_id" "⚠️ Ya procesada anteriormente (o expiró)"
      answer_callback "$callback_id" "Ya procesada o expirada"
      continue
    fi
    uid=$(echo "$entry" | cut -f2)
    name=$(echo "$entry" | cut -f3)
    email=$(echo "$entry" | cut -f4)

    case "$action" in
      approve)
        docker exec -u www-data "$NEXTCLOUD_CONTAINER" php occ user:enable "$uid" >/dev/null
        docker exec -u www-data "$NEXTCLOUD_CONTAINER" php occ group:adduser STP "$uid" >/dev/null
        echo "$(date -Iseconds) aprobada por Telegram: $uid ($name)"
        edit_message "$chat_id" "$message_id" "✅ Cuenta aprobada: ${name} (${email:-sin email})"
        answer_callback "$callback_id" "Aprobada"
        ;;
      reject)
        echo "$(date -Iseconds) rechazada por Telegram: $uid ($name) — sigue deshabilitada"
        edit_message "$chat_id" "$message_id" "🚫 Cuenta rechazada (sigue deshabilitada): ${name} (${email:-sin email})"
        answer_callback "$callback_id" "Rechazada"
        ;;
      *)
        answer_callback "$callback_id" "Acción desconocida"
        continue
        ;;
    esac

    grep -vP "^${short_id}\t" "$PENDING_FILE" > "${PENDING_FILE}.tmp" || true
    mv "${PENDING_FILE}.tmp" "$PENDING_FILE"
  done
done
