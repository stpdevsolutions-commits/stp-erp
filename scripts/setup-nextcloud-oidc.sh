#!/bin/bash
# Configura Google OIDC en Nextcloud (user_oidc app)
# Ejecutar una vez después de agregar NEXTCLOUD_OIDC_CLIENT_ID y
# NEXTCLOUD_OIDC_CLIENT_SECRET al .env
# Uso: ./scripts/setup-nextcloud-oidc.sh
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$COMPOSE_DIR/.env" ]; then
  export $(grep -E '^NEXTCLOUD_OIDC_' "$COMPOSE_DIR/.env" | xargs)
fi

if [ -z "${NEXTCLOUD_OIDC_CLIENT_ID:-}" ] || [ "${NEXTCLOUD_OIDC_CLIENT_ID}" = "CHANGE_ME" ]; then
  echo "ERROR: Define NEXTCLOUD_OIDC_CLIENT_ID y NEXTCLOUD_OIDC_CLIENT_SECRET en .env primero."
  exit 1
fi

echo "Configurando Google OIDC en Nextcloud..."

docker exec stp-nextcloud php occ user_oidc:provider Google \
  --clientid="$NEXTCLOUD_OIDC_CLIENT_ID" \
  --clientsecret="$NEXTCLOUD_OIDC_CLIENT_SECRET" \
  --discoveryuri="https://accounts.google.com/.well-known/openid-configuration" \
  --unique-uid=0 \
  --check-bearer=1

echo "Listo. Los usuarios pueden iniciar sesión en Nextcloud con su cuenta Google Workspace."
echo "Redirect URI configurada: https://cloud.stpsoluciones.com/index.php/apps/user_oidc/code"
