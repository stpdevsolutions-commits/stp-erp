import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MetricsService } from './metrics.service';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationsService } from '../notifications/notifications.service';

const THRESHOLDS = { cpu: 85, ram: 90, disk: 85 };

interface ThresholdCheck {
  key: string;
  name: string;
  value: number;
  threshold: number;
}

@Injectable()
export class ThresholdService implements OnModuleInit {
  private readonly logger = new Logger(ThresholdService.name);
  private prevState = new Map<string, boolean>();

  constructor(
    private readonly metrics: MetricsService,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    setTimeout(() => this.checkThresholds(), 15000);
  }

  @Interval(60000)
  async checkThresholds() {
    const m = await this.metrics.getMetrics();
    const now = new Date().toLocaleString('es-DO');

    const checks: ThresholdCheck[] = [
      { key: 'cpu', name: 'CPU', value: m.cpu.percent, threshold: THRESHOLDS.cpu },
      { key: 'ram', name: 'RAM', value: m.ram.percent, threshold: THRESHOLDS.ram },
      ...m.disks.map((d) => ({
        key: `disk_${d.mount}`,
        name: `Disco ${d.mount}`,
        value: d.percent,
        threshold: THRESHOLDS.disk,
      })),
    ];

    for (const check of checks) {
      const isAlert = check.value >= check.threshold;
      const wasAlert = this.prevState.get(check.key) ?? false;

      if (isAlert && !wasAlert) {
        const msg =
          `⚠️ <b>Alerta de Recursos</b>\n` +
          `📊 <b>Recurso:</b> ${check.name}\n` +
          `📈 <b>Uso actual:</b> ${check.value}%\n` +
          `🚨 <b>Umbral:</b> ${check.threshold}%\n` +
          `⏰ <b>Hora:</b> ${now}`;
        await this.alerts.createAlert(
          check.key,
          check.name,
          'warning',
          `${check.name} al ${check.value}% (umbral: ${check.threshold}%)`,
        );
        await this.notifications.sendTelegram(msg);
        this.logger.warn(`${check.name} superó umbral: ${check.value}%`);
      } else if (!isAlert && wasAlert) {
        const msg =
          `✅ <b>${check.name} Normalizado</b>\n` +
          `📊 <b>Uso actual:</b> ${check.value}%\n` +
          `⏰ <b>Hora:</b> ${now}`;
        await this.notifications.sendTelegram(msg);
        this.logger.log(`${check.name} recuperado: ${check.value}%`);
      }

      this.prevState.set(check.key, isAlert);
    }
  }
}
