// Puente interno de WhatsApp (Baileys) — vincula el WhatsApp real de STP
// (+18095376566) como si fuera "WhatsApp Web" y expone un solo endpoint HTTP
// interno (`POST /send`) para que stp-api mande avisos de tareas asignadas.
//
// NO es la API oficial de Meta: es texto libre, sin plantillas, y decisión
// consciente de STP de asumir el riesgo de que Meta detecte el patrón de
// envíos automatizados y banee el número real del negocio.
//
// La sesión (credenciales del "dispositivo vinculado") se guarda en
// /data/auth, montado como volumen — sobrevive a un `docker compose up` sin
// pedir escanear el QR de nuevo. Si el volumen se borra o WhatsApp cierra la
// sesión (p. ej. "Cerrar todas las sesiones" desde el teléfono), hay que
// volver a escanear: ver el QR con `docker logs -f stp-whatsapp-bridge`.

const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 3900;
const AUTH_DIR = process.env.AUTH_DIR || '/data/auth';

let sock = null;
let connectionStatus = 'disconnected';

// Almacén mínimo de mensajes enviados, en memoria: cuando el teléfono
// receptor no logra descifrar un mensaje a la primera (normal al abrir una
// sesión nueva), WhatsApp pide un reintento y Baileys llama a `getMessage`
// para volver a cifrar y reenviar el mismo contenido. Sin esto, el mensaje
// se queda para siempre como "Esperando este mensaje" en el teléfono — es un
// problema documentado de Baileys, no de la sesión en sí. Se limita el
// tamaño para no crecer sin límite en un proceso de larga duración.
const sentMessages = new Map();
const MAX_STORED_MESSAGES = 500;

function rememberSentMessage(key, message) {
  if (!key?.id) return;
  sentMessages.set(key.id, message);
  if (sentMessages.size > MAX_STORED_MESSAGES) {
    const oldestKey = sentMessages.keys().next().value;
    sentMessages.delete(oldestKey);
  }
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'warn' });

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    // Manejamos el QR nosotros (abajo) para poder loguear instrucciones claras
    // junto a él — printQRInTerminal queda deprecado en versiones nuevas.
    printQRInTerminal: false,
    // Ver comentario de `sentMessages` arriba: sin esto, un reintento de
    // descifrado del receptor no tiene forma de completarse.
    getMessage: async (key) => sentMessages.get(key.id),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n\n══════════════════════════════════════════════════════');
      console.log('  ESCANEA ESTE QR — WhatsApp (celular) → Dispositivos');
      console.log('  vinculados → Vincular un dispositivo');
      console.log('══════════════════════════════════════════════════════\n');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('\n(Si se ve cortado, agranda la terminal o corre:');
      console.log(' docker logs -f stp-whatsapp-bridge)\n');
      QRCode.toFile('/data/auth/latest-qr.png', qr, { width: 500 }).catch((err) =>
        console.error('Error generando PNG del QR:', err),
      );
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      console.log('✓ WhatsApp conectado — el puente ya puede enviar mensajes.');
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(
        loggedOut
          ? '✗ Sesión cerrada desde el teléfono — hay que volver a escanear el QR (se mostrará arriba en el próximo intento).'
          : `Conexión cerrada (${statusCode ?? 'sin código'}). Reconectando...`,
      );
      if (!loggedOut) {
        startSock().catch((err) => console.error('Error reconectando:', err));
      }
    }
  });
}

startSock().catch((err) => {
  console.error('Error iniciando el puente de WhatsApp:', err);
  process.exit(1);
});

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: connectionStatus });
});

// Página de emparejamiento: se auto-refresca sola mientras espera el QR, y
// cambia a "Conectado" apenas Baileys abre la sesión. Pensada para abrirse
// una sola vez, desde el navegador (con VPN activa) — no requiere pasar el QR
// por ningún otro lado ni tiene el retraso de generarlo/copiarlo manualmente.
app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vincular WhatsApp — STP</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; background: #F0F4F8; color: #0D1B2A; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  p { color: #64748B; font-size: 13px; margin-top: 4px; }
  img { width: min(360px, 90vw); height: auto; margin-top: 16px; border-radius: 12px; border: 1px solid #E2E8F0; background: #fff; padding: 12px; }
  .ok { font-size: 60px; margin-top: 20px; }
  .ok-text { color: #16A34A; font-weight: 700; font-size: 18px; margin-top: 8px; }
</style>
</head>
<body>
  <h1>📱 Vincular WhatsApp de STP</h1>
  <p>Escanea con el WhatsApp de +1 809-537-6566 → Dispositivos vinculados</p>
  <div id="content"><img id="qr" src="/qr.png" alt="Cargando QR..." /></div>
  <script>
    async function tick() {
      try {
        const r = await fetch('/health', { cache: 'no-store' });
        const { status } = await r.json();
        if (status === 'connected') {
          document.getElementById('content').innerHTML = '<div class="ok">✓</div><div class="ok-text">WhatsApp conectado</div>';
          return;
        }
      } catch (e) {}
      const img = document.getElementById('qr');
      if (img) img.src = '/qr.png?t=' + Date.now();
      setTimeout(tick, 2500);
    }
    tick();
  </script>
</body>
</html>`);
});

app.get('/qr.png', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile('/data/auth/latest-qr.png', (err) => {
    if (err) res.status(404).end();
  });
});

app.post('/send', async (req, res) => {
  const { to, text } = req.body || {};
  if (!to || !text) {
    return res.status(400).json({ error: 'to y text son requeridos' });
  }
  if (!sock || connectionStatus !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp no está conectado (falta escanear el QR o se perdió la sesión)' });
  }
  try {
    const jid = `${to}@s.whatsapp.net`;
    const sent = await sock.sendMessage(jid, { text });
    rememberSentMessage(sent?.key, sent?.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Puente de WhatsApp escuchando en :${PORT} (estado inicial: ${connectionStatus})`));
