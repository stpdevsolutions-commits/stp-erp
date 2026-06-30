import { Controller, Get } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  getAll() {
    return this.alerts.getAlerts(50);
  }

  @Get('test')
  async testAlert() {
    const now = new Date().toLocaleString('es-DO');
    const telegramMsg =
      `🧪 <b>Alerta de Prueba — Vigía</b>\n` +
      `✅ El pipeline de notificaciones está funcionando correctamente.\n` +
      `⏰ <b>Hora:</b> ${now}\n` +
      `🖥️ <b>Sistema:</b> monitor.stpsoluciones.com`;
    const emailHtml = `
      <h2 style="color:#3b82f6">🧪 Alerta de Prueba — Vigía</h2>
      <p>✅ El pipeline de notificaciones de correo está funcionando correctamente.</p>
      <p><strong>Hora:</strong> ${now}</p>
      <p><strong>Sistema:</strong> monitor.stpsoluciones.com</p>
      <hr/>
      <p style="color:#6b7280;font-size:12px">Vigía · Infraestructura Bajo Control · STP Soluciones</p>
    `;
    await Promise.all([
      this.notifications.sendTelegram(telegramMsg),
      this.notifications.sendEmail('🧪 Alerta de Prueba — Vigía', emailHtml),
    ]);
    return { ok: true, message: 'Alerta de prueba enviada por Telegram y correo.' };
  }
}
