import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envío de WhatsApp. PENDIENTE DE PROVEEDOR: se probó un puente propio no
 * oficial (Baileys, "WhatsApp Web" en otro dispositivo) y se abandonó el
 * 2026-08-30 — los mensajes salían "enviados" del lado del bridge pero el
 * receptor nunca lograba descifrarlos ("Esperando este mensaje"), incluso
 * tras reconstruir la sesión desde cero y probar Baileys 6.x y 7.0-rc; se
 * descartó por ser un problema de la librería, no de configuración. El plan
 * es usar la API oficial de Meta (WhatsApp Cloud API) en cuanto se resuelva
 * el registro de Meta for Developers.
 *
 * Sin WHATSAPP_BRIDGE_URL configurado (caso actual), el envío queda
 * desactivado — mismo patrón que NotificationsService con Resend: nunca
 * lanza, solo loguea y sigue. El resto de la feature (checkbox de notificar,
 * normalizePhone, etc.) queda intacto para cuando haya un proveedor real.
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
