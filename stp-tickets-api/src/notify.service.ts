import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Avisos a Telegram cuando pasa algo importante en un ticket (se crea, se
 * resuelve). Reutiliza el MISMO bot de Hermes Agent (@stp_asistente_bot) —
 * no es un bot nuevo, solo otra cosa que le manda mensajes a Pedro con la
 * API normal de Telegram, sin pasar por Hermes ni por MCP para esto (es
 * más simple mandar directo que hacer que Hermes "decida" avisar).
 * Nunca lanza: un fallo de Telegram no debe tumbar la creación de un ticket.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private readonly botToken?: string;
  private readonly chatId?: string;

  constructor(private readonly config: ConfigService) {
    // Nombre propio (no TELEGRAM_BOT_TOKEN a secas) porque Vigía ya usa esa
    // variable para SU bot de alertas — son dos bots distintos.
    this.botToken = this.config.get<string>('HERMES_TELEGRAM_BOT_TOKEN');
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!this.botToken || !this.chatId) {
      this.logger.warn('HERMES_TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID no configurados — avisos desactivados');
    }
  }

  send(text: string): void {
    if (!this.botToken || !this.chatId) return;
    void this.doSend(text);
  }

  private async doSend(text: string): Promise<void> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
      if (!res.ok) {
        this.logger.error(`Telegram respondió ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Fallo mandando aviso a Telegram: ${(err as Error).message}`);
    }
  }
}
