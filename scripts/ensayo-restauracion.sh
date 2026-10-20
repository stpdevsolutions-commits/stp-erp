#!/bin/bash
# Ensayo de restauracion (INF-5). Restaura un snapshot de Drive en contenedores
# Postgres TEMPORALES (red "none", sin puertos, nombres drill-*) y compara conteos
# contra produccion. NO escribe en produccion ni en Drive; solo LEE (docker exec
# psql SELECT, rclone copy desde Drive, lectura de .env.backup).
# La frase GPG nunca se imprime ni aparece en argumentos de procesos (va por stdin).
# Uso: bash scripts/ensayo-restauracion.sh [AAAA-MM-DD]   (por defecto: el de hoy)
set -u
FECHA="${1:-$(date +%F)}"
BASE=/data/restore-drill
W="$BASE/$FECHA"
SNAP="$W/snapshot"
LOG="$W/ensayo.log"
umask 077
mkdir -p "$SNAP" "$W/sec" "$W/res" || exit 1
rm -f "$W/res/"* "$LOG"
T0=$(date +%s)
CONTS=()
VOLS=()

log() { printf '[ensayo %s +%ss] %s\n' "$(date +%T)" "$(( $(date +%s) - T0 ))" "$*" | tee -a "$LOG"; }

limpiar() {
  log "Limpieza..."
  for c in "${CONTS[@]}"; do docker rm -f "$c" >/dev/null 2>&1; done
  for v in "${VOLS[@]}"; do docker volume rm -f "$v" >/dev/null 2>&1; done
  [ -d "$W/sec" ] && find "$W/sec" -type f -exec shred -u {} + 2>/dev/null
  rm -rf "$SNAP" "$W/sec"
  log "Limpieza hecha. Restos: $(docker ps -a --format '{{.Names}}' | grep -c '^drill-') contenedores drill-*, $(docker volume ls -q | grep -c '^drill-') volumenes drill-*; carpeta $W conserva solo logs/resultados."
}
trap limpiar EXIT

# 1. Descarga desde Drive (lo que se usaria en un desastre real)
log "1. Descargando snapshot $FECHA de Drive..."
rclone copy "gdrive:backups diarios/snapshots/$FECHA" "$SNAP" --transfers 4 -q || { log "FALLO la descarga"; exit 1; }
log "   descargados $(ls "$SNAP" | wc -l) archivos, $(du -sh "$SNAP" | cut -f1)"
# comparar con la copia local
OKH=0; MALH=0
for f in "$SNAP"/*; do
  n=$(basename "$f")
  if [ -f "/data/backups/snapshots/$FECHA/$n" ]; then
    if cmp -s "$f" "/data/backups/snapshots/$FECHA/$n"; then OKH=$((OKH+1)); else MALH=$((MALH+1)); log "   DIFIERE de la copia local: $n"; fi
  fi
done
log "   Drive vs local: $OKH identicos, $MALH distintos"

# 2. Integridad de todos los tar/gz
log "2. Integridad de archivos comprimidos..."
for f in "$SNAP"/*.gz; do
  if gzip -t "$f" 2>/dev/null; then :; else log "   gzip CORRUPTO: $(basename "$f")"; fi
done
for f in "$SNAP"/*.tar.gz; do
  tar tzf "$f" >/dev/null 2>&1 && log "   tar OK: $(basename "$f") ($(tar tzf "$f" 2>/dev/null | wc -l) entradas)" || log "   tar CON PROBLEMAS: $(basename "$f")"
done

# 3. Secretos: descifrar con la frase (por stdin, sin imprimirla)
log "3. Descifrando secretos con la frase GPG..."
FRASE=$(grep '^BACKUP_GPG_PASSPHRASE=' "$HOME/stp/.env.backup" | head -1 | cut -d= -f2-)
FRASE="${FRASE%\"}"; FRASE="${FRASE#\"}"; FRASE="${FRASE%\'}"; FRASE="${FRASE#\'}"
log "   longitud de la frase: ${#FRASE} caracteres (valor no mostrado)"
if printf '%s\n' "$FRASE" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 -d "$SNAP/secretos.tar.gz.gpg" 2>/dev/null | tar xzf - -C "$W/sec" 2>/dev/null; then
  NF=$(find "$W/sec" -type f | wc -l)
  log "   descifrado OK: $NF archivos (nombres no listados por seguridad de rutas; solo conteo)"
  # comparar por hash, sin imprimir contenido
  for rel in stp/.env .env; do
    p=$(find "$W/sec" -type f -path "*${rel}" 2>/dev/null | head -1)
    [ -n "$p" ] && [ -f "$HOME/$rel" ] && { a=$(sha256sum < "$p"); b=$(sha256sum < "$HOME/$rel"); [ "$a" = "$b" ] && log "   $rel respaldado == actual (hash)" || log "   $rel respaldado != actual (cambio posterior al respaldo o distinto)"; }
  done
  log "   rutas de nivel superior: $(tar tzf <(printf '%s\n' "$FRASE" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 -d "$SNAP/secretos.tar.gz.gpg" 2>/dev/null) 2>/dev/null | cut -d/ -f1-2 | sort -u | tr '\n' ' ')"
else
  log "   FALLO el descifrado"
fi
unset FRASE

# 4. Bases de datos
restaurar() { # nombre_dump  contenedor_prod  imagen  [mem]
  local dump="$1" prod="$2" img="$3" mem="${4:-1g}"
  local d="$SNAP/db-$dump.sql.gz" c="drill-$dump" v="drill-vol-$dump"
  [ -f "$d" ] || { log "   (no hay $d)"; return; }
  local t1; t1=$(date +%s)
  local admin; admin=$(docker exec "$prod" printenv POSTGRES_USER 2>/dev/null); admin="${admin:-postgres}"
  CONTS+=("$c"); VOLS+=("$v")
  log "4.$dump: arrancando $c ($img) como $admin..."
  docker run -d --name "$c" --network none --memory "$mem" -e POSTGRES_USER="$admin" -e POSTGRES_PASSWORD=drill \
    -v "$v":/var/lib/postgresql/data "$img" >/dev/null || { log "   FALLO arrancar $c"; return; }
  for i in $(seq 1 90); do docker exec "$c" pg_isready -U "$admin" -q 2>/dev/null && break; sleep 1; done
  sleep 3
  local t2; t2=$(date +%s)
  zcat "$d" | docker exec -i "$c" psql -U "$admin" -d postgres -q -v ON_ERROR_STOP=0 > "$W/res/restore-$dump.out" 2> "$W/res/restore-$dump.err"
  local t3; t3=$(date +%s)
  local errs; errs=$(grep -c 'ERROR' "$W/res/restore-$dump.err")
  local errs_nobenignos; errs_nobenignos=$(grep 'ERROR' "$W/res/restore-$dump.err" | grep -vc 'already exists')
  log "   restaurado en $((t3-t2))s (arranque $((t2-t1))s). ERROR en psql: $errs ($errs_nobenignos distintos de 'already exists')"
  grep 'ERROR' "$W/res/restore-$dump.err" | grep -v 'already exists' | sort | uniq -c | sort -rn | head -5 | sed 's/^/     /' | tee -a "$LOG"
  # conteos exactos por tabla: restaurado vs produccion
  for side in drill prod; do
    local cont="$c"; [ "$side" = prod ] && cont="$prod"
    for db in $(docker exec "$cont" psql -U "$admin" -d postgres -tAc "select datname from pg_database where not datistemplate order by 1" 2>/dev/null); do
      docker exec "$cont" psql -U "$admin" -d "$db" -tA -F'|' -c "select format('select %L, count(*) from %I.%I;', '$db.'||schemaname||'.'||relname, schemaname, relname) from pg_stat_user_tables order by 1" 2>/dev/null \
        | docker exec -i "$cont" psql -U "$admin" -d "$db" -tA -F'|' 2>/dev/null >> "$W/res/$side-$dump.counts"
    done
    sort -o "$W/res/$side-$dump.counts" "$W/res/$side-$dump.counts"
  done
  local nt nd ns sumd sump
  nt=$(wc -l < "$W/res/drill-$dump.counts"); np=$(wc -l < "$W/res/prod-$dump.counts")
  sumd=$(awk -F'|' '{s+=$2} END{print s+0}' "$W/res/drill-$dump.counts")
  sump=$(awk -F'|' '{s+=$2} END{print s+0}' "$W/res/prod-$dump.counts")
  nd=$(join -t'|' "$W/res/drill-$dump.counts" "$W/res/prod-$dump.counts" | awk -F'|' '$2!=$3' | wc -l)
  log "   tablas: restauradas=$nt produccion=$np | filas totales: restauradas=$sumd produccion=$sump | tablas con conteo distinto: $nd"
  join -t'|' "$W/res/drill-$dump.counts" "$W/res/prod-$dump.counts" | awk -F'|' '$2!=$3 {printf "     dif %s: restaurado=%s prod=%s\n",$1,$2,$3}' | head -8 | tee -a "$LOG"
  log "   claves:"
  sort -t'|' -k2 -nr "$W/res/drill-$dump.counts" | head -6 | awk -F'|' '{printf "     %s = %s\n",$1,$2}' | tee -a "$LOG"
  docker rm -f "$c" >/dev/null 2>&1; docker volume rm -f "$v" >/dev/null 2>&1
}

PG15=postgres:15-alpine
restaurar stp-postgres stp-postgres "$PG15" 1g
restaurar ecf-postgres ecf-postgres "$PG15" 512m
restaurar estructural_db estructural_db "$PG15" 512m
restaurar appflowy-postgres-1 appflowy-postgres-1 pgvector/pgvector:pg16 1g
IMMICH_IMG=$(docker inspect immich_postgres --format '{{.Config.Image}}')
restaurar immich_postgres immich_postgres "$IMMICH_IMG" 3g

# 5. Vaultwarden (SQLite)
log "5. Vaultwarden: abriendo la base SQLite del respaldo..."
mkdir -p "$W/sec/vw" && tar xzf "$SNAP/vaultwarden-data.tar.gz" -C "$W/sec/vw" 2>/dev/null
DBV=$(find "$W/sec/vw" -name 'db.sqlite3' | head -1)
if [ -n "$DBV" ]; then
  python3 - "$DBV" <<'PY' | tee -a "$LOG"
import sqlite3, sys
c = sqlite3.connect('file:%s?mode=ro' % sys.argv[1], uri=True)
print("   integrity_check:", c.execute("pragma integrity_check").fetchone()[0])
for t in ("users", "ciphers", "organizations"):
    try: print("   %s: %s" % (t, c.execute("select count(*) from %s" % t).fetchone()[0]))
    except Exception as e: print("   %s: n/d (%s)" % (t, e))
PY
else
  log "   no se encontro db.sqlite3"
fi
log "Ensayo terminado en $(( $(date +%s) - T0 )) s."
