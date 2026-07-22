#!/bin/bash
# cleanup-erp-named-legacy.sh — Limpia hard links LEGACY duplicados en /storage/erp-named/
#
# PROBLEMA: una versión anterior de sync-erp-names.sh escribía los hard links en
# la RAÍZ del directorio del proyecto (p.ej. "<Cliente>/<PRJ-...>/IMAGENES/foto.jpg")
# y en "<Cliente>/Documentos". La versión actual coloca todo bajo carpetas
# gestionadas ("ERP - <Contexto>" a nivel cliente y "<PRJ-...>/ERP/..." a nivel
# proyecto), por lo que los links viejos quedaron huérfanos y cada archivo se ve
# DOS veces en Nextcloud.
#
# En esas mismas raíces pueden existir archivos subidos A MANO por usuarios vía
# Nextcloud: esos NO se tocan jamás.
#
# CRITERIO DE SEGURIDAD — un archivo se considera "legacy borrable" solo si
# cumple LOS TRES requisitos:
#   1. Está bajo /storage/erp-named/ pero FUERA de toda carpeta gestionada
#      (fuera de */ERP/* y de */ERP - */*).
#   2. Su INODE también existe DENTRO de alguna carpeta gestionada (ERP/ o
#      "ERP - ") — es decir, el sync actual ya lo cubre y no se pierde nada.
#   3. Su INODE también existe en /storage/erp-uploads/ (el origen del ERP) —
#      prueba definitiva de que el archivo lo gestiona el ERP y no es una
#      subida manual de Nextcloud.
# Un archivo manual de un usuario tiene nlink=1 y no cumple ni 2 ni 3.
#
# MODO DE USO:
#   ./cleanup-erp-named-legacy.sh              # DRY-RUN (por defecto): solo lista
#   ./cleanup-erp-named-legacy.sh --execute    # borra de verdad (rm -v --) y
#                                              # elimina dirs vacíos resultantes
#                                              # (solo fuera de carpetas gestionadas)
set -euo pipefail

NAMED="/storage/erp-named"
UPLOADS="/storage/erp-uploads"

MODE="dry-run"
if [[ "${1:-}" == "--execute" ]]; then
  MODE="execute"
elif [[ -n "${1:-}" ]]; then
  echo "Uso: $0 [--execute]   (sin flag = dry-run)" >&2
  exit 2
fi

[[ -d "$NAMED" ]]   || { echo "ERROR: no existe $NAMED" >&2; exit 1; }
[[ -d "$UPLOADS" ]] || { echo "ERROR: no existe $UPLOADS" >&2; exit 1; }

# ── Índices de inodes (una pasada por árbol; O(n), sin finds anidados) ────────
# inode → una ruta representativa en erp-uploads
declare -A UP_INODE=()
while IFS=$'\t' read -r ino p; do
  UP_INODE["$ino"]="$p"
done < <(find "$UPLOADS" -type f -printf '%i\t%p\n')

# inode → una ruta representativa dentro de carpetas gestionadas de erp-named
declare -A MANAGED_INODE=()
while IFS=$'\t' read -r ino p; do
  MANAGED_INODE["$ino"]="$p"
done < <(find "$NAMED" -type f \( -path '*/ERP/*' -o -path '*/ERP - */*' \) -printf '%i\t%p\n')

# ── Clasificación de archivos fuera de carpetas gestionadas ──────────────────
declare -a TO_DELETE=()          # rutas legacy borrables
declare -a KEEP=()               # potenciales subidas manuales (NO tocar)
declare -a KEEP_REASON=()

while IFS=$'\t' read -r ino nlink path; do
  managed="${MANAGED_INODE[$ino]:-}"
  upload="${UP_INODE[$ino]:-}"
  if [[ -n "$managed" && -n "$upload" ]]; then
    TO_DELETE+=("$path")
    printf 'BORRARÍA  inode=%s nlink=%s\n  legacy   : %s\n  gestionada: %s\n  origen   : %s\n' \
      "$ino" "$nlink" "$path" "$managed" "$upload"
  else
    reason=""
    [[ -z "$managed" ]] && reason="sin copia en carpeta gestionada"
    [[ -z "$upload" ]] && reason="${reason:+$reason; }sin inode en erp-uploads"
    KEEP+=("$path")
    KEEP_REASON+=("$reason")
    printf 'CONSERVA  inode=%s nlink=%s (%s)\n  %s\n' "$ino" "$nlink" "$reason" "$path"
  fi
done < <(find "$NAMED" -type f ! -path '*/ERP/*' ! -path '*/ERP - */*' -printf '%i\t%n\t%p\n')

echo
echo "══════════════════════════════════════════════════════════════"
echo "Resumen ($MODE):"
echo "  Legacy borrables : ${#TO_DELETE[@]}"
echo "  Conservados (posibles manuales): ${#KEEP[@]}"
echo "══════════════════════════════════════════════════════════════"

if [[ "$MODE" == "dry-run" ]]; then
  echo "DRY-RUN: no se ha tocado nada. Ejecuta con --execute para borrar."
  exit 0
fi

# ── Borrado real ─────────────────────────────────────────────────────────────
echo "EJECUTANDO borrado real..."
for f in "${TO_DELETE[@]+"${TO_DELETE[@]}"}"; do
  rm -v -- "$f"
done

# Borra directorios vacíos resultantes SOLO fuera de las carpetas gestionadas:
# se excluye toda carpeta "ERP"/"ERP - *" y cualquier cosa dentro de ellas.
# (Nota: -delete implica -depth; con -depth el -prune no funciona, por eso ! -path.)
find "$NAMED" -mindepth 1 -type d -empty \
  ! -name 'ERP' ! -name 'ERP - *' \
  ! -path '*/ERP/*' ! -path "*/ERP - */*" \
  -print -delete

echo "Hecho. Recuerda re-escanear Nextcloud (occ files:scan) sobre el mount de Proyectos ERP."
