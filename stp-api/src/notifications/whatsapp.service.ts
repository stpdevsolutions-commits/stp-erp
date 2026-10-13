import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envío de WhatsApp vía la API oficial de Meta (WhatsApp Cloud API).
 *
 * Se probó antes un puente propio no oficial (Baileys, "WhatsApp Web" en otro
 * dispositivo) y se abandonó el 2026-08-30 — los mensajes salían "enviados"
 * del lado del bridge pero el receptor nunca lograba descifrarlos, incluso
 * tras reconstruir la sesión desde cero y probar Baileys 6.x y 7.0-rc; se
 * descartó por ser un problema de la librería, no de configuración.
 *
 * Usa una plantilla de mensaje aprobada por Meta ("tarea_asignada"), no texto
 * libre: el destinatario (colaborador) normalmente no le ha escrito antes al
 * número de negocio, así que un mensaje de texto libre fallaría en silencio
 * por la regla de la ventana de servicio de 24h. Las plantillas de tipo
 * "utility" sí se pueden enviar en cualquier momento.
 *
 * Sin WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID configurados, el envío
 * queda desactivado — mismo patrón que NotificationsService con Resend:
 * nunca lanza, solo loguea y sigue.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly accessToken?: string;
  private readonly phoneNumberId?: string;
  private static readonly GRAPH_API_VERSION = 'v21.0';
  private static readonly TEMPLATE_NAME = 'tarea_asignada';
  private static readonly TEMPLATE_LANGUAGE = 'es';

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(
        'WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID no configurados — notificaciones por WhatsApp desactivadas',
      );
    }
  }

  /**
   * Notifica a un técnico/colaborador que se le asignó una tarea. Si no hay
   * teléfono o no hay credenciales configuradas, no hace nada silenciosamente
   * (nunca debe tumbar la creación/actualización de la tarea).
   */
  sendTaskAssigned(params: {
    phone?: string | null;
    recipientName: string;
    projectName: string;
    /** Lo que debe decir la tarea en el mensaje (placeholder "Tarea:" de la
     * plantilla) — normalmente la descripción, no el título (ver TicketsService
     * ERP-3: el título suele ser una etiqueta corta, la descripción es la
     * instrucción real que el colaborador necesita leer). */
    taskText: string;
    dueDate?: string | null;
  }): void {
    const { phone, recipientName, projectName, taskText, dueDate } = params;
    if (!phone) return;

    void this.sendTemplate(phone, WhatsappService.TEMPLATE_NAME, WhatsappService.TEMPLATE_LANGUAGE, [
      recipientName,
      projectName,
      // Meta rechaza parámetros de plantilla con saltos de línea/tabs/4+
      // espacios seguidos — una descripción con varias líneas tumbaría el
      // envío completo si no se aplana primero.
      sanitizeTemplateParam(taskText),
      dueDate ? formatDate(dueDate) : 'Sin fecha límite',
    ]);
  }

  get enabled(): boolean {
    return !!this.accessToken && !!this.phoneNumberId;
  }

  /** Texto libre. Solo llega si el destinatario escribió en las últimas 24 h (regla de Meta). */
  async sendText(rawPhone: string, text: string): Promise<void> {
    await this.sendFree(rawPhone, { type: 'text', text: { body: text.slice(0, 4000), preview_url: false } });
  }

  /** Hasta 3 botones de respuesta (título de máx. 20 caracteres). */
  async sendButtons(rawPhone: string, body: string, buttons: { id: string; title: string }[]): Promise<void> {
    await this.sendFree(rawPhone, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }

  /** Lista desplegable: hasta 10 filas en total (título de máx. 24 caracteres, descripción de 72). */
  async sendList(
    rawPhone: string,
    body: string,
    buttonText: string,
    rows: { id: string; title: string; description?: string }[],
  ): Promise<void> {
    await this.sendFree(rawPhone, {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body.slice(0, 1024) },
        action: {
          button: buttonText.slice(0, 20),
          sections: [
            {
              title: 'Opciones',
              rows: rows.slice(0, 10).map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                ...(r.description ? { description: r.description.slice(0, 72) } : {}),
              })),
            },
          ],
        },
      },
    });
  }

  /**
   * Descarga una foto o PDF que mandó un usuario. Meta da primero la dirección (que caduca a los
   * 5 minutos) y luego se baja con el mismo token. `null` si falla o pesa más de `maxBytes`.
   */
  async downloadMedia(mediaId: string, maxBytes: number): Promise<{ buffer: Buffer; mime: string } | null> {
    if (!this.accessToken) return null;
    try {
      const auth = { Authorization: `Bearer ${this.accessToken}` };
      const metaRes = await fetch(
        `https://graph.facebook.com/${WhatsappService.GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`,
        { headers: auth, signal: AbortSignal.timeout(15_000) },
      );
      if (!metaRes.ok) {
        this.logger.error(`Meta respondió ${metaRes.status} al pedir el media ${mediaId}`);
        return null;
      }
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
      if (!meta.url || !isMetaMediaUrl(meta.url)) return null;
      if (meta.file_size && meta.file_size > maxBytes) return null;

      const fileRes = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
      if (!fileRes.ok) return null;
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      if (buffer.length > maxBytes) return null;
      return { buffer, mime: meta.mime_type ?? fileRes.headers.get('content-type') ?? 'application/octet-stream' };
    } catch (err) {
      this.logger.error(`No se pudo descargar el media ${mediaId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Quien quiera guardar lo que sale (la bandeja de mensajes del ERP-57) se registra aquí y recibe
   * cada mensaje libre enviado con éxito, incluidas las respuestas automáticas del flujo de facturas.
   */
  setOutboundRecorder(recorder: OutboundRecorder): void {
    this.recorder = recorder;
  }

  private recorder?: OutboundRecorder;

  /** Texto libre que devuelve el id de Meta y LANZA si falla: lo usa la bandeja, que debe mostrar el error. */
  async sendTextTracked(rawPhone: string, text: string): Promise<{ wamid: string }> {
    return this.postTracked(rawPhone, { type: 'text', text: { body: text.slice(0, 4000), preview_url: false } });
  }

  /** Plantilla aprobada (con botones de respuesta rápida si los tiene) que devuelve el id y lanza si falla. */
  async sendTemplateTracked(
    rawPhone: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<{ wamid: string }> {
    return this.postTracked(rawPhone, {
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: sanitizeTemplateParam(text) })) },
        ],
      },
    });
  }

  /**
   * Sube una foto o PDF a Meta y lo envía (imagen con pie, o documento con nombre). Solo vale dentro
   * de la ventana de 24 h, como el texto libre. Lanza si Meta lo rechaza.
   */
  async sendMediaTracked(
    rawPhone: string,
    m: { buffer: Buffer; mime: string; filename: string; caption?: string },
  ): Promise<{ wamid: string }> {
    if (!this.accessToken || !this.phoneNumberId) throw new Error('WhatsApp no está configurado en el servidor');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', m.mime);
    form.append('file', new Blob([new Uint8Array(m.buffer)], { type: m.mime }), m.filename);
    const up = await fetch(`https://graph.facebook.com/${WhatsappService.GRAPH_API_VERSION}/${this.phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const upJson = (await up.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!up.ok || !upJson.id) throw new Error(upJson.error?.message ?? `No se pudo subir el archivo (HTTP ${up.status})`);
    const caption = m.caption?.trim() || undefined;
    return this.postTracked(
      rawPhone,
      m.mime.startsWith('image/')
        ? { type: 'image', image: { id: upJson.id, ...(caption ? { caption } : {}) } }
        : { type: 'document', document: { id: upJson.id, filename: m.filename, ...(caption ? { caption } : {}) } },
    );
  }

  private async postTracked(rawPhone: string, payload: Record<string, unknown>): Promise<{ wamid: string }> {
    if (!this.accessToken || !this.phoneNumberId) throw new Error('WhatsApp no está configurado en el servidor');
    const to = normalizePhone(rawPhone);
    if (!to) throw new Error('Número de teléfono inválido');
    const res = await fetch(
      `https://graph.facebook.com/${WhatsappService.GRAPH_API_VERSION}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accessToken}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; error_data?: { details?: string } };
    };
    if (!res.ok || !json.messages?.[0]?.id) {
      const detail = json.error?.error_data?.details ?? json.error?.message ?? `HTTP ${res.status}`;
      this.logger.error(`WhatsApp respondió ${res.status} a ${to}: ${detail}`);
      throw new Error(detail);
    }
    return { wamid: json.messages[0].id };
  }

  /** Envío de mensaje libre (no plantilla). Nunca lanza: solo registra el fallo. */
  private async sendFree(rawPhone: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.accessToken || !this.phoneNumberId) return;
    const to = normalizePhone(rawPhone);
    if (!to) return;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${WhatsappService.GRAPH_API_VERSION}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accessToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) {
        this.logger.error(`WhatsApp respondió ${res.status} al contestar a ${to}: ${await res.text()}`);
        return;
      }
      if (this.recorder) {
        const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
        await this.recorder({ to, wamid: json.messages?.[0]?.id, payload }).catch((e: Error) =>
          this.logger.error(`No se pudo registrar el mensaje saliente: ${e.message}`),
        );
      }
    } catch (err) {
      this.logger.error(`Fallo contestando por WhatsApp a ${to}: ${(err as Error).message}`);
    }
  }

  /** Manda una plantilla aprobada con parámetros posicionales en el body ({{1}}, {{2}}, ...). */
  private async sendTemplate(
    rawPhone: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<void> {
    if (!this.accessToken || !this.phoneNumberId) return;
    const to = normalizePhone(rawPhone);
    if (!to) {
      this.logger.warn(`Teléfono inválido, no se envía WhatsApp: "${rawPhone}"`);
      return;
    }

    const url = `https://graph.facebook.com/${WhatsappService.GRAPH_API_VERSION}/${this.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text();
        this.logger.error(`WhatsApp Cloud API respondió ${res.status} para ${to}: ${errBody}`);
        return;
      }
      this.logger.log(`WhatsApp (plantilla "${templateName}") enviado a ${to}`);
    } catch (err) {
      this.logger.error(`Fallo enviando WhatsApp a ${to}: ${(err as Error).message}`);
    }
  }
}

/** Lo que el servicio entrega a quien registre los mensajes salientes: destinatario, id de Meta y el cuerpo enviado. */
export type OutboundRecorder = (m: { to: string; wamid?: string; payload: Record<string, unknown> }) => Promise<void>;

/** Solo se descarga de los servidores de Meta: la dirección viene de su respuesta, pero no se confía a ciegas. */
function isMetaMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /(^|\.)(fbsbx\.com|whatsapp\.net|fbcdn\.net|facebook\.com)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Aplana un texto para que sirva como parámetro de plantilla de WhatsApp:
 * Meta rechaza el envío completo si un parámetro trae salto de línea, tab, o
 * 4+ espacios seguidos. También lo recorta a un largo razonable para que el
 * mensaje no quede gigante en la pantalla del colaborador.
 */
function sanitizeTemplateParam(text: string, maxLength = 300): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

/** "15 de marzo de 2026" a partir de un date ISO (YYYY-MM-DD). Si el formato no es el esperado, devuelve el valor tal cual. */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Deja solo dígitos y antepone el código de país de RD (1) si el número trae
 * los 10 dígitos locales sin código ("809-537-6566" → "18095376566"), como
 * exige la API de WhatsApp (número completo con código de país, sin "+").
 * Devuelve null si el resultado no parece un número real.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  if (withCountry.length < 10 || withCountry.length > 15) return null;
  return withCountry;
}
