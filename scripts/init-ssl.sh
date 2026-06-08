#!/bin/bash
# Inicialización del certificado SSL con Let's Encrypt
# Ejecutar UNA VEZ desde ~/stp en el servidor
# Requisitos: dominio apuntando a esta IP, puerto 80 y 443 abiertos

set -e

DOMAIN="stpsoluciones.com"
EMAIL="pedroangss@gmail.com"
CERT_DIR="./nginx/certbot/conf/live/$DOMAIN"
WWW_DIR="./nginx/certbot/www"

echo "=== STP SSL Init ==="
echo "Dominio: $DOMAIN"
echo "IP pública: $(curl -s ifconfig.me)"
echo ""

# Crear directorios si no existen
mkdir -p "$CERT_DIR"
mkdir -p "$WWW_DIR"

# Paso 1: Certificado dummy para que nginx pueda arrancar con el bloque SSL
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "[1/4] Creando certificado temporal para arrancar nginx..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=$DOMAIN" 2>/dev/null
  echo "      OK"
else
  echo "[1/4] Certificado existente encontrado, saltando..."
fi

# Paso 2: Levantar/recargar nginx con el cert dummy
echo "[2/4] Levantando nginx..."
docker compose up -d stp-nginx
sleep 3
docker exec stp-nginx nginx -s reload 2>/dev/null || true
sleep 2
echo "      OK"

# Paso 3: Obtener certificado real de Let's Encrypt
echo "[3/4] Solicitando certificado a Let's Encrypt..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"
echo "      OK"

# Paso 4: Recargar nginx con el certificado real
echo "[4/4] Recargando nginx con certificado real..."
docker exec stp-nginx nginx -s reload
echo "      OK"

echo ""
echo "=== SSL configurado correctamente ==="
echo "Sitio disponible en: https://$DOMAIN"
echo ""
echo "Renovación automática: el contenedor stp-certbot renueva cada 12h."
echo "Para activar COOKIE_SECURE, agregar al .env: COOKIE_SECURE=true"
echo "y luego: docker compose up -d stp-landing"
