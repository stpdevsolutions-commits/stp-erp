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

# Escapa un valor para el formato de fichero de configuración de curl, donde los
# valores entre comillas admiten \\ , \" y \n.
curl_cfg_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  printf '%s' "$s"
}

# Llama a la API de Telegram pasándole a curl la petición entera por stdin
# (--config -) en lugar de por argumentos. El token viaja dentro de la URL, así
# que ponerlo en la línea de comandos lo dejaría visible en /proc/<pid>/cmdline
# para cualquier usuario del sistema (un simple `ps aux` lo delata). De esta
# forma `ps` solo ve "curl --config -".
# Uso: tg_call <endpoint> <get|post> <pares clave=valor...>
tg_call() {
  local endpoint=$1 method=$2 pair
  shift 2
  {
    printf 'url = "%s/%s"\n' "$API" "$endpoint"
    printf 'silent\n'
    printf 'max-time = %s\n' "$([ "$method" = get ] && echo 20 || echo 10)"
    if [ "$method" = get ]; then
      printf 'get\n'
      printf 'keepalive-time = 5\n'
    fi
    for pair in "$@"; do
      printf 'data-urlencode = "%s"\n' "$(curl_cfg_escape "$pair")"
    done
  } | curl --config -
}

answer_callback() {
  local callback_id="$1" text="$2" resp
  resp=$(tg_call answerCallbackQuery post \
    "callback_query_id=${callback_id}" \
    "text=${text}")
  if [ "$(echo "$resp" | jq -r '.ok // false' 2>/dev/null)" != "true" ]; then
    echo "$(date -Iseconds) ERROR answerCallbackQuery falló: ${resp:-sin respuesta}" >&2
  fi
}

edit_message() {
  local chat_id="$1" message_id="$2" text="$3" resp
  resp=$(tg_call editMessageText post \
    "chat_id=${chat_id}" \
    "message_id=${message_id}" \
    "text=${text}")
  if [ "$(echo "$resp" | jq -r '.ok // false' 2>/dev/null)" != "true" ] \
     && ! echo "$resp" | jq -e '(.description // "") | test("message is not modified")' >/dev/null 2>&1; then
    echo "$(date -Iseconds) ERROR editMessageText falló: ${resp:-sin respuesta}" >&2
  fi
}

echo "$(date -Iseconds) telegram-bot-poller arrancando"

while true; do
  OFFSET=$(cat "$OFFSET_FILE" 2>/dev/null || echo "")

  UPDATES=$(tg_call getUpdates get \
    "timeout=15" \
    'allowed_updates=["callback_query"]' \
    ${OFFSET:+"offset=${OFFSET}"})

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
