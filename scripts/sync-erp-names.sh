#!/bin/bash
# sync-erp-names.sh — Mirror /storage/erp-uploads/ en /storage/erp-named/ con nombres legibles.
# Usa rsync --link-dest para crear hard links: mismo inode, cero duplicación de datos.
# Nextcloud ve directorios y archivos reales (sin symlinks), sin restricciones de scanner.
# Cron: */15 * * * * /home/stp/stp/scripts/sync-erp-names.sh >> /home/stp/stp/logs/sync-erp-names.log 2>&1
set -euo pipefail

UPLOADS="/storage/erp-uploads"
NAMED="/storage/erp-named"

safe_name() {
  echo "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr '/' '-' | tr ':' '-'
}

sync_dir() {
  local src="$1" dst="$2"
  [[ -d "$src" ]] || return 0
  mkdir -p "$dst"
  rsync -a --delete --link-dest="$(realpath "$src")/" "$src/" "$dst/" 2>/dev/null || true
}

mkdir -p "$NAMED"

# Leer clientes y proyectos de la DB
mapfile -t clients < <(docker exec -i stp-postgres psql -U stp_user -d stp_db -t -A -F'|' \
  -c "SELECT id, name FROM clients ORDER BY name;")

for client_row in "${clients[@]}"; do
  [[ -z "$client_row" ]] && continue
  cid="${client_row%%|*}"
  cname="${client_row#*|}"
  cid="${cid//[[:space:]]/}"
  safe_cname=$(safe_name "$cname")

  # Documentos del cliente
  sync_dir "$UPLOADS/clients/$cid/documents" "$NAMED/$safe_cname/Documentos"

  # Proyectos del cliente
  mapfile -t projects < <(docker exec -i stp-postgres psql -U stp_user -d stp_db -t -A -F'|' \
    -c "SELECT id, name, code FROM projects WHERE \"clientId\" = '$cid' ORDER BY code;")

  for proj_row in "${projects[@]}"; do
    [[ -z "$proj_row" ]] && continue
    IFS='|' read -r pid pname pcode <<< "$proj_row"
    pid="${pid//[[:space:]]/}"
    pcode="${pcode//[[:space:]]/}"
    safe_pname=$(safe_name "$pname")

    sync_dir "$UPLOADS/clients/$cid/projects/$pid/documents" \
      "$NAMED/$safe_cname/$pcode - $safe_pname"
  done
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] sync-erp-names: OK"
