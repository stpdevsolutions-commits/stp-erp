#!/bin/bash
# nextcloud-account-gate.sh — Deshabilita automáticamente cualquier cuenta nueva
# de Nextcloud que no esté en ningún grupo (login vía Google sin aprobar todavía)
# y avisa por Telegram con botones Aprobar/Rechazar (reusa credenciales de Vigía).
# Los botones los procesa telegram-bot-poller.sh — aprobar/rechazar también se
# puede hacer a mano:
#   docker exec -u www-data stp-nextcloud php occ user:enable <uid> && \
#   docker exec -u www-data stp-nextcloud php occ group:adduser STP <uid>
# Cron: */5 * * * * /home/stp/stp/scripts/nextcloud-account-gate.sh >> /home/stp/stp/logs/nextcloud-account-gate.log 2>&1
set -euo pipefail

NEXTCLOUD_CONTAINER=stp-nextcloud
VIGIA_CONTAINER=vigia-backend
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPTS_DIR/.nextcloud-gate-notified"
PENDING_FILE="$SCRIPTS_DIR/.nextcloud-gate-pending"

touch "$STATE_FILE" "$PENDING_FILE"

TELEGRAM_BOT_TOKEN=$(docker exec "$VIGIA_CONTAINER" printenv TELEGRAM_BOT_TOKEN)
TELEGRAM_CHAT_ID=$(docker exec "$VIGIA_CONTAINER" printenv TELEGRAM_CHAT_ID)

USERS_JSON=$(docker exec -u www-data "$NEXTCLOUD_CONTAINER" php occ user:list --info --output=json)

echo "$USERS_JSON" | jq -r '
  to_entries[]
  | select(.value.enabled == true)
  | select((.value.groups | length) == 0)
  | [.key, .value.display_name, .value.email] | @tsv
' | while IFS=$'\t' read -r uid name email; do
  [ -z "$uid" ] && continue

  docker exec -u www-data "$NEXTCLOUD_CONTAINER" php occ user:disable "$uid" >/dev/null
  echo "$(date -Iseconds) deshabilitada cuenta sin aprobar: $uid ($name, ${email:-sin email})"

  if ! grep -qxF "$uid" "$STATE_FILE"; then
    echo "$uid" >> "$STATE_FILE"

    short_id=$(echo -n "$uid$(date +%s%N)" | sha256sum | cut -c1-10)
    printf '%s\t%s\t%s\t%s\n' "$short_id" "$uid" "$name" "$email" >> "$PENDING_FILE"

    MSG="🔒 Nueva cuenta en cloud.stpsoluciones.com sin aprobar:
${name} (${email:-sin email})
Deshabilitada automáticamente hasta aprobación."
    REPLY_MARKUP=$(printf '{"inline_keyboard":[[{"text":"✅ Aprobar","callback_data":"approve:%s"},{"text":"🚫 Rechazar","callback_data":"reject:%s"}]]}' "$short_id" "$short_id")

    curl -s --max-time 10 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${MSG}" \
      --data-urlencode "reply_markup=${REPLY_MARKUP}" >/dev/null
  fi
done
