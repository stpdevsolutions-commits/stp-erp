#!/bin/bash
# Guarda RBN_DB_URL (con la contraseña codificada para URL) en ~/stp/.env.redbendicion (permisos 600).
# La contraseña se pide oculta; no se muestra ni queda en el historial ni en `ps`.
# Opcional: RBN_POOLER_HOST=aws-1-us-east-1.pooler.supabase.com ./rbn-guardar-url.sh
set -euo pipefail
ARCHIVO="$HOME/stp/.env.redbendicion"
HOST="${RBN_POOLER_HOST:-aws-0-us-east-1.pooler.supabase.com}"
USUARIO="postgres.bmfcjupkqdnlhqoiujwz"

read -r -s -p "Contraseña de la base de Red Bendición (oculta): " PASS; echo
[ -n "$PASS" ] || { echo "Contraseña vacía, no se guardó nada." >&2; exit 1; }
ENC=$(PASS="$PASS" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PASS"],safe=""))')
unset PASS

umask 077
TMP=$(mktemp "$HOME/stp/.env.redbendicion.XXXXXX")
# conserva otras líneas (p. ej. RBN_SUPABASE_URL / RBN_SERVICE_KEY) y reemplaza RBN_DB_URL
if [ -f "$ARCHIVO" ]; then grep -v '^RBN_DB_URL=' "$ARCHIVO" > "$TMP" || true; fi
echo "RBN_DB_URL=postgresql://$USUARIO:$ENC@$HOST:5432/postgres" >> "$TMP"
chmod 600 "$TMP"; mv "$TMP" "$ARCHIVO"
echo "Guardado en $ARCHIVO (600). Prueba: ~/stp/scripts/backup-redbendicion.sh --ahora"
echo "Si falla la conexión, prueba el otro host: RBN_POOLER_HOST=aws-1-us-east-1.pooler.supabase.com $0"
