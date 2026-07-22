import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';

const MAX_INTENTOS = 4;
const TIMEOUT_MS = 15000;
const BACKOFF_BASE_MS = 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly config: ConfigService) {}

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Un 4xx significa payload o credenciales mal: reintentar solo gasta tiempo.
   * Un 5xx, un timeout o un fallo de red sí son transitorios (Telegram devuelve
   * 504 con cierta frecuencia) y son justo los que hacían que la alerta se perdiera.
   */
  private esTransitorio(err: unknown): boolean {
    if (!axios.isAxiosError(err)) return false;
    const status = err.response?.status;
    if (status === undefined) return true;
    return status >= 500;
  }

  private async postConReintentos(
    servicio: string,
    url: string,
    body: unknown,
    config: AxiosRequestConfig = {},
  ): Promise<boolean> {
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      try {
        await axios.post(url, body, { timeout: TIMEOUT_MS, ...config });
        if (intento > 1) {
          this.logger.log(`${servicio} enviado tras ${intento} intentos`);
        }
        return true;
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const detalle = status ? `HTTP ${status}` : (err as Error).message;

        if (!this.esTransitorio(err)) {
          this.logger.error(`${servicio} error permanente (${detalle}) — no se reintenta`);
          return false;
        }
        if (intento === MAX_INTENTOS) {
          this.logger.error(`${servicio} error (${detalle}) — agotados ${MAX_INTENTOS} intentos, alerta perdida`);
          return false;
        }

        const espera = BACKOFF_BASE_MS * 2 ** (intento - 1);
        this.logger.warn(`${servicio} error (${detalle}) — reintento ${intento + 1}/${MAX_INTENTOS} en ${espera}ms`);
        await this.sleep(espera);
      }
    }
    return false;
  }

  async sendTelegram(message: string) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return;
    await this.postConReintentos('Telegram', `https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
  }

  async sendEmail(subject: string, html: string) {
    const apiKey = this.config.get('RESEND_API_KEY');
    const from = this.config.get('ALERT_FROM_EMAIL', 'noreply@stpsoluciones.com');
    const to = this.config.get('ALERT_TO_EMAIL');
    if (!apiKey || !to) return;
    await this.postConReintentos(
      'Resend',
      'https://api.resend.com/emails',
      { from, to, subject, html },
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
  }
}
