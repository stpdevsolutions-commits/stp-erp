#!/bin/bash
# sync-erp-names.sh — Espeja /storage/erp-uploads/ en /storage/erp-named/ con
# nombres legibles, para que TODO archivo del ERP sea visible/compartible en
# Nextcloud (External Storage "Proyectos ERP", grupo STP).
#
# Diseño:
#  - Usa hard links (ln -f): mismo inode que erp-uploads → CERO duplicación de datos.
#  - Renombra cada archivo a su nombre original (columna originalName de la BD);
#    las fotos de fichas dejan de verse como UUID.
#  - Los archivos del ERP se colocan SIEMPRE dentro de carpetas dedicadas
#    ("ERP - ..." a nivel cliente y "ERP/..." dentro de cada proyecto). El pruning
#    (borrado de sobrantes) actúa EXCLUSIVAMENTE dentro de esas carpetas ERP, por
#    lo que NUNCA toca archivos que el usuario haya subido a mano en Nextcloud.
#    (El script anterior escribía en la raíz del proyecto y en "Documentos" con
#    rsync --delete, lo que podía BORRAR archivos manuales del usuario.)
#
# Cron: */15 * * * * /home/stp/stp/scripts/sync-erp-names.sh >> /home/stp/stp/logs/sync-erp-names.log 2>&1
set -euo pipefail

UPLOADS="/storage/erp-uploads"
NAMED="/storage/erp-named"
LOCK="/tmp/sync-erp-names.lock"

# Evita solapamiento entre ejecuciones del cron
exec 9>"$LOCK"
flock -n 9 || { echo "[$(date '+%F %T')] sync-erp-names: ya en ejecución, salto"; exit 0; }

PSQL=(docker exec -i stp-postgres psql -U stp_user -d stp_db -t -A -F'|')

safe_name() {
  # Neutraliza separadores de ruta y espacios sobrantes; conserva el resto
  echo "$1" | sed 's#[/:]#-#g; s/^[[:space:]]*//; s/[[:space:]]*$//'
}

# ── Mapa nombre-original: rutaAbsoluta → originalName ────────────────────────
declare -A NAMEMAP=()
while IFS='|' read -r p orig; do
  [[ -z "$p" ]] && continue
  NAMEMAP["$UPLOADS/$p"]="$orig"
done < <("${PSQL[@]}" -c 'SELECT path, "originalName" FROM uploaded_files;')

# ── Espeja un directorio de origen del ERP en una carpeta ERP dedicada ───────
# dst SIEMPRE es una carpeta gestionada por el ERP → es seguro podar su contenido.
mirror_leaf() {
  local src="$1" dst="$2"

  if [[ ! -d "$src" ]]; then
    # El origen ya no existe → retira el espejo gestionado (solo hard links)
    [[ -d "$dst" ]] && rm -rf -- "$dst"
    return 0
  fi

  mkdir -p -- "$dst"
  declare -A keep=()

  # Enlaza cada archivo (recursivo, preservando subcarpetas del origen)
  while IFS= read -r -d '' f; do
    local rel reldir base friendly outdir out stem ext
    rel="${f#"$src"/}"
    reldir="$(dirname "$rel")"
    base="$(basename "$rel")"
    friendly="$(safe_name "${NAMEMAP[$f]:-$base}")"
    [[ -z "$friendly" ]] && friendly="$base"

    outdir="$dst"
    [[ "$reldir" != "." ]] && outdir="$dst/$reldir"
    mkdir -p -- "$outdir"
    out="$outdir/$friendly"

    # Colisión de nombres entre inodes distintos → desambigua con el basename real
    if [[ -n "${keep[$out]:-}" && "${keep[$out]}" != "$f" ]]; then
      stem="${friendly%.*}"; ext=""
      [[ "$friendly" == *.* ]] && ext=".${friendly##*.}"
      out="$outdir/${stem} (${base%.*})${ext}"
    fi

    # Un fallo puntual (p.ej. EPERM sobre un archivo de otro dueño con
    # protected_hardlinks) no debe abortar todo el espejo: se registra y sigue.
    if ln -f -- "$f" "$out" 2>/dev/null; then
      keep["$out"]="$f"
    else
      echo "[$(date '+%F %T')] WARN: no se pudo enlazar '$f' → '$out' (¿permisos?)" >&2
    fi
  done < <(find "$src" -type f -print0)

  # Poda: elimina hard links que ya no existen en el origen (borrados/renombrados)
  while IFS= read -r -d '' g; do
    [[ -z "${keep[$g]:-}" ]] && rm -f -- "$g"
  done < <(find "$dst" -type f -print0)

  find "$dst" -type d -empty -delete 2>/dev/null || true
  mkdir -p -- "$dst"
}

mkdir -p "$NAMED"

# ── Clientes ─────────────────────────────────────────────────────────────────
mapfile -t clients < <("${PSQL[@]}" -c "SELECT id, name FROM clients ORDER BY name;")

for client_row in "${clients[@]}"; do
  [[ -z "$client_row" ]] && continue
  cid="${client_row%%|*}"; cname="${client_row#*|}"
  cid="${cid//[[:space:]]/}"
  safe_cname="$(safe_name "$cname")"
  cbase="$NAMED/$safe_cname"

  # Contextos a nivel de cliente (sin proyecto)
  mirror_leaf "$UPLOADS/clients/$cid/profile"   "$cbase/ERP - Perfil"
  mirror_leaf "$UPLOADS/clients/$cid/documents" "$cbase/ERP - Documentos"
  mirror_leaf "$UPLOADS/clients/$cid/quotes"    "$cbase/ERP - Cotizaciones"
  mirror_leaf "$UPLOADS/clients/$cid/payments"  "$cbase/ERP - Pagos"

  # Proyectos del cliente
  mapfile -t projects < <("${PSQL[@]}" \
    -c "SELECT id, name, code FROM projects WHERE \"clientId\" = '$cid' ORDER BY code;")

  for proj_row in "${projects[@]}"; do
    [[ -z "$proj_row" ]] && continue
    IFS='|' read -r pid pname pcode <<< "$proj_row"
    pid="${pid//[[:space:]]/}"; pcode="${pcode//[[:space:]]/}"
    safe_pname="$(safe_name "$pname")"
    pbase="$cbase/$pcode - $safe_pname/ERP"
    psrc="$UPLOADS/clients/$cid/projects/$pid"

    mirror_leaf "$psrc/documents" "$pbase/Documentos"
    mirror_leaf "$psrc/photos"    "$pbase/Fotos"
    mirror_leaf "$psrc/expenses"  "$pbase/Gastos"
    mirror_leaf "$psrc/quotes"    "$pbase/Cotizaciones"
    mirror_leaf "$psrc/payments"  "$pbase/Pagos"

    # Fotos de fichas técnicas (guardadas por projectId bajo fichas/)
    mirror_leaf "$UPLOADS/fichas/$pid/photos" "$pbase/Fotos de Campo (Fichas)"
  done
done

echo "[$(date '+%F %T')] sync-erp-names: OK (${#clients[@]} clientes, ${#NAMEMAP[@]} archivos en índice)"
