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
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  if (withCountry.length < 10 || withCountry.length > 15) return null;
  return withCountry;
}
