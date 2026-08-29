import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envío de WhatsApp vía WhatsApp Cloud API (Meta), usando plantillas
 * pre-aprobadas: un mensaje que la EMPRESA inicia (no es respuesta a un
 * cliente dentro de una conversación de 24h) no puede ser texto libre, tiene
 * que ser una "message template" aprobada de antemano en Meta Business Manager.
 *
 * Sin WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID configurados, el envío
 * queda desactivado — mismo patrón que NotificationsService con Resend (no
 * lanza, solo loguea y sigue).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly accessToken?: string;
  private readonly phoneNumberId?: string;
  private readonly apiVersion: string;
  private readonly taskTemplateName: string;
  private readonly templateLang: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.apiVersion = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
    this.taskTemplateName = this.config.get<string>('WHATSAPP_TASK_TEMPLATE_NAME') ?? 'tarea_asignada';
    this.templateLang = this.config.get<string>('WHATSAPP_TEMPLATE_LANG') ?? 'es';

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn('WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID no configurados — notificaciones por WhatsApp desactivadas');
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
    taskTitle: string;
    dueDate?: string | null;
  }): void {
    const { phone, recipientName, projectName, taskTitle, dueDate } = params;
    if (!phone) return;
    void this.sendTemplate({
      to: phone,
      templateName: this.taskTemplateName,
      params: [recipientName, projectName, taskTitle, dueDate ? formatDate(dueDate) : 'Sin fecha límite'],
    });
  }

  private async sendTemplate(options: { to: string; templateName: string; params: string[] }): Promise<void> {
    if (!this.accessToken || !this.phoneNumberId) return;
    const to = normalizePhone(options.to);
    if (!to) {
      this.logger.warn(`Teléfono inválido, no se envía WhatsApp: "${options.to}"`);
      return;
    }

    try {
      const res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: options.templateName,
            language: { code: this.templateLang },
            components: [
              {
                type: 'body',
                parameters: options.params.map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`WhatsApp API respondió ${res.status} para ${to}: ${body}`);
        return;
      }
      this.logger.log(`WhatsApp "${options.templateName}" enviado a ${to}`);
    } catch (err) {
      this.logger.error(`Fallo enviando WhatsApp a ${to}: ${(err as Error).message}`);
    }
  }
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
 * exige la API (E.164 sin "+"). Devuelve null si el resultado no parece un
 * número real.
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  if (withCountry.length < 10 || withCountry.length > 15) return null;
  return withCountry;
}
