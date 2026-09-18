# Watchdog externo

Detecta caídas totales de `stp-server` (ej. corte de energía en la oficina) desde fuera de esa red/energía. Se ejecuta en la VM de Oracle Cloud (150.136.3.93), la misma que sirve de control server de Headscale — no en `stp-server`.

## Por qué existe

Vigía (`stp-monitor/`) corre en el mismo host físico que monitorea. Si `stp-server` pierde energía, Vigía muere con él y no puede alertar la caída — solo manda un saludo de "en línea" al reiniciar, que parece una alerta de recuperación pero no lo es. Este watchdog cubre ese punto ciego chequeando desde una máquina independiente.

## Qué chequea

`https://dia.stpsoluciones.com` (Mi Día) — el único subdominio público sin restricción de IP que además corre de verdad en `stp-server` (todo lo demás en el Caddyfile está limitado a rangos VPN/LAN, no alcanzable desde la VM de Oracle a menos que se una al mesh de Headscale).

**Corregido 2026-09-18:** antes chequeaba `stpsoluciones.com`, pero ese dominio pasó a servirse desde **Vercel** (ver `stpsoluciones-landing`) — seguiría respondiendo "arriba" aunque `stp-server` se apagara por completo, dejando el watchdog ciego justo para el escenario que existe para cubrir. Si algún día `dia.stpsoluciones.com` deja de ser la única app pública sin VPN, hay que revisar de nuevo cuál usar.

## Deploy

No corre en Docker (la VM tiene poca RAM libre y ya sostiene el control server de Headscale). Es un script + cron plano:

```bash
scp -r oracle-watchdog ubuntu@150.136.3.93:/home/ubuntu/watchdog
ssh ubuntu@150.136.3.93
cd /home/ubuntu/watchdog
cp .env.example .env   # completar con credenciales reales, chmod 600
chmod 750 watchdog.sh
(crontab -l 2>/dev/null; echo '*/2 * * * * /home/ubuntu/watchdog/watchdog.sh') | crontab -
```

## Comportamiento

- Corre cada 2 minutos.
- Requiere 2 fallos consecutivos (~4 min) antes de declarar caída, para evitar falsos positivos por blips de red.
- Alerta por Telegram y email (Resend) en la transición up→down y down→up, con minutos de downtime en la recuperación.
- Estado en `state` / `down_since` (no versionados); log de transiciones en `watchdog.log`.

## Intento fallido de arreglo (2026-09-18) -- revertido

Se intentó cambiar la URL a `dia.stpsoluciones.com` (justificación arriba
sigue siendo válida en teoría: es la única app pública real de stp-server).
**Revertido el mismo día** porque, probado en vivo, la VM de Oracle no
logra completar una petición HTTP/HTTPS a ese dominio -- el handshake TLS
llega bien pero la respuesta nunca llega (timeout, reproducible 100% de
las veces, con HTTP/1.1, IPv4 forzado y User-Agent de navegador). El
mismo curl SÍ funciona sin problema contra `stpsoluciones.com` (Vercel) y
contra internet en general -- apunta a un bloqueo del lado de Cloudflare
específico de la zona de `dia.stpsoluciones.com` contra el rango de IPs
de Oracle Cloud (WAF / bot-fight-mode / firewall rule), no a un problema
de Caddy (esa ruta no tiene restricción de IP) ni de la app en sí (responde
en 44ms desde cualquier otra red).

**Costó una alerta falsa real** (servidor caído a las 02:50 UTC del
2026-09-18, servidor en realidad sano) antes de revertir -- si se retoma
este arreglo, probar la conectividad Oracle→destino ANTES de dejarlo
corriendo sin vigilancia, y/o revisar las reglas de firewall de Cloudflare
para la zona de `dia.stpsoluciones.com` (permitir el ASN de Oracle Cloud)
antes de cambiar la URL de nuevo. Mientras tanto, el watchdog sigue
chequeando `stpsoluciones.com`, que como está en Vercel NO detecta un
apagón real de stp-server -- el punto ciego original sigue sin resolver.
