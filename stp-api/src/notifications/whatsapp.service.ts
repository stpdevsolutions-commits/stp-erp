import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envío de WhatsApp vía un puente propio (Baileys, ver `whatsapp-bridge/` en
 * la raíz del repo) que mantiene una sesión vinculada al WhatsApp real de la
 * empresa (+18095376566) como si fuera "WhatsApp Web" desde otro dispositivo.
 *
 * Decisión consciente de STP: NO es la API oficial de Meta (esa requiere
 * verificación de negocio + plantillas de mensaje pre-aprobadas, y el registro
 * de Meta for Developers estaba bloqueado). Esto es texto libre, sin
 * plantillas, con el riesgo real de que Meta detecte el patrón automatizado y
 * banee el número — riesgo que STP decidió asumir.
 *
 * Sin WHATSAPP_BRIDGE_URL configurado, o si el puente no está conectado
 * (sesión sin escanear/perdida), el envío queda desactivado — mismo patrón
 * que NotificationsService con Resend: nunca lanza, solo loguea y sigue.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly bridgeUrl?: string;

  constructor(private readonly config: ConfigService) {
    this.bridgeUrl = this.config.get<string>('WHATSAPP_BRIDGE_URL');
    if (!this.bridgeUrl) {
      this.logger.warn('WHATSAPP_BRIDGE_URL no configurado — notificaciones por WhatsApp desactivadas');
    }
  }

  /**
   * Notifica a un técnico/colaborador que se le asignó una tarea. Si no hay
   * teléfono o no hay puente configurado, no hace nada silenciosamente (nunca
   * debe tumbar la creación/actualización de la tarea).
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

    const text =
      `Hola ${recipientName}, se te asignó una nueva tarea en STP.\n\n` +
      `Proyecto: ${projectName}\n` +
      `Tarea: ${taskTitle}\n` +
      `Fecha límite: ${dueDate ? formatDate(dueDate) : 'Sin fecha límite'}\n\n` +
      `Ingresa a la app STP Técnicos para ver los detalles.`;

    void this.send(phone, text);
  }

  private async send(rawPhone: string, text: string): Promise<void> {
    if (!this.bridgeUrl) return;
    const to = normalizePhone(rawPhone);
    if (!to) {
      this.logger.warn(`Teléfono inválido, no se envía WhatsApp: "${rawPhone}"`);
      return;
    }

    try {
      const res = await fetch(`${this.bridgeUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Puente de WhatsApp respondió ${res.status} para ${to}: ${body}`);
        return;
      }
      this.logger.log(`WhatsApp enviado a ${to}`);
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
 * exige Baileys (número completo con código de país, sin "+"). Devuelve null
 * si el resultado no parece un número real.
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  if (withCountry.length < 10 || withCountry.length > 15) return null;
  return withCountry;
}
