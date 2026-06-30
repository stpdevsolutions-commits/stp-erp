import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendTelegram(message: string) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Telegram error', err.message);
    }
  }

  async sendEmail(subject: string, html: string) {
    const apiKey = this.config.get('RESEND_API_KEY');
    const from = this.config.get('ALERT_FROM_EMAIL', 'noreply@stpsoluciones.com');
    const to = this.config.get('ALERT_TO_EMAIL');
    if (!apiKey || !to) return;
    try {
      await axios.post(
        'https://api.resend.com/emails',
        { from, to, subject, html },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
    } catch (err) {
      this.logger.error('Resend error', err.message);
    }
  }
}
