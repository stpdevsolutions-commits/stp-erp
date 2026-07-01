# Watchdog externo

Detecta caídas totales de `stp-server` (ej. corte de energía en la oficina) desde fuera de esa red/energía. Se ejecuta en la VM de Oracle Cloud (150.136.3.93), la misma que sirve de control server de Headscale — no en `stp-server`.

## Por qué existe

Vigía (`stp-monitor/`) corre en el mismo host físico que monitorea. Si `stp-server` pierde energía, Vigía muere con él y no puede alertar la caída — solo manda un saludo de "en línea" al reiniciar, que parece una alerta de recuperación pero no lo es. Este watchdog cubre ese punto ciego chequeando desde una máquina independiente.

## Qué chequea

`https://stpsoluciones.com` — el único subdominio público sin restricción de IP (todo lo demás en el Caddyfile está limitado a rangos VPN/LAN, no alcanzable desde la VM de Oracle a menos que se una al mesh de Headscale).

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
