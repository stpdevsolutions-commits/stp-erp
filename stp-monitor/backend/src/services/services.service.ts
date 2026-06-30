import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as net from 'net';
import * as https from 'https';
import axios from 'axios';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
import { ServiceCheck } from './entities/service-check.entity';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface ServiceDef {
  id: string;
  name: string;
  url: string;
  type: 'http' | 'tcp';
}

export interface ServiceStatus extends ServiceDef {
  status: 'up' | 'down' | 'unknown';
  latency: number | null;
  lastCheck: string;
  uptimePercent: number;
}

const DEFAULT_SERVICES: ServiceDef[] = [
  { id: 'stp-landing', name: 'STP Landing', url: 'http://stp-landing:3000', type: 'http' },
  { id: 'stp-api', name: 'STP API', url: 'http://stp-api:3001/health', type: 'http' },
  { id: 'postgres', name: 'PostgreSQL', url: 'stp-postgres:5432', type: 'tcp' },
  { id: 'redis', name: 'Redis', url: 'stp-redis:6379', type: 'tcp' },
  { id: 'nextcloud', name: 'Nextcloud', url: 'http://stp-nextcloud:80', type: 'http' },
  { id: 'vaultwarden', name: 'Vaultwarden', url: 'http://stp-vaultwarden:80', type: 'http' },
  { id: 'adguard', name: 'AdGuard Home', url: 'https://stp-adguard:3443', type: 'http' },
  { id: 'estructuralrd', name: 'EstrucCalc RD', url: 'http://estructural_nginx:80', type: 'http' },
];

@Injectable()
export class ServicesService implements OnModuleInit {
  private readonly logger = new Logger(ServicesService.name);
  private latestStatuses = new Map<string, ServiceStatus>();
  private previousStatuses = new Map<string, string>();

  constructor(
    @InjectRepository(ServiceCheck)
    private readonly checksRepo: Repository<ServiceCheck>,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    setTimeout(() => this.checkAll(), 2000);
  }

  private async checkHttp(url: string): Promise<{ status: 'up' | 'down'; latency: number | null }> {
    const start = Date.now();
    try {
      await axios.get(url, {
        timeout: 10000,
        validateStatus: (s) => s < 500,
        httpsAgent: url.startsWith('https') ? httpsAgent : undefined,
      });
      return { status: 'up', latency: Date.now() - start };
    } catch {
      return { status: 'down', latency: null };
    }
  }

  private checkTcp(hostPort: string): Promise<{ status: 'up' | 'down'; latency: number | null }> {
    return new Promise((resolve) => {
      const [host, portStr] = hostPort.split(':');
      const port = parseInt(portStr, 10);
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(port, host, () => {
        socket.destroy();
        resolve({ status: 'up', latency: Date.now() - start });
      });
      socket.on('error', () => resolve({ status: 'down', latency: null }));
      socket.on('timeout', () => { socket.destroy(); resolve({ status: 'down', latency: null }); });
    });
  }

  private async calcUptime(serviceId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, up] = await Promise.all([
      this.checksRepo.count({ where: { serviceId, checkedAt: MoreThan(since) } }),
      this.checksRepo.count({ where: { serviceId, status: 'up', checkedAt: MoreThan(since) } }),
    ]);
    if (total === 0) return 100;
    return Math.round((up / total) * 1000) / 10;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAll() {
    await Promise.all(DEFAULT_SERVICES.map((svc) => this.checkOne(svc)));
  }

  private async checkOne(svc: ServiceDef) {
    const result = svc.type === 'http' ? await this.checkHttp(svc.url) : await this.checkTcp(svc.url);
    const uptimePercent = await this.calcUptime(svc.id);

    const check = this.checksRepo.create({
      serviceId: svc.id,
      name: svc.name,
      url: svc.url,
      type: svc.type,
      status: result.status,
      latency: result.latency,
    });
    await this.checksRepo.save(check);

    const status: ServiceStatus = {
      ...svc,
      status: result.status,
      latency: result.latency,
      lastCheck: new Date().toISOString(),
      uptimePercent,
    };
    this.latestStatuses.set(svc.id, status);

    const prev = this.previousStatuses.get(svc.id);
    if (prev && prev !== result.status) {
      const type = result.status === 'down' ? 'down' : 'up';
      const msg =
        type === 'down'
          ? `🔴 <b>Servicio Caído</b>\n📌 <b>Servicio:</b> ${svc.name}\n⏰ <b>Hora:</b> ${new Date().toLocaleString('es-DO')}\n🌐 <b>URL:</b> ${svc.url}`
          : `✅ <b>Servicio Recuperado</b>\n📌 <b>Servicio:</b> ${svc.name}\n⏰ <b>Hora:</b> ${new Date().toLocaleString('es-DO')}\n⏱️ <b>Latencia:</b> ${result.latency ?? '-'}ms`;

      await this.alerts.createAlert(svc.id, svc.name, type, `${svc.name} está ${type === 'down' ? 'caído' : 'recuperado'}`);
      await this.notifications.sendTelegram(msg);
      this.logger.warn(`${svc.name} → ${result.status}`);
    }
    this.previousStatuses.set(svc.id, result.status);
  }

  getStatuses(): ServiceStatus[] {
    if (this.latestStatuses.size === 0) {
      return DEFAULT_SERVICES.map((svc) => ({
        ...svc,
        status: 'unknown' as const,
        latency: null,
        lastCheck: new Date().toISOString(),
        uptimePercent: 100,
      }));
    }
    return Array.from(this.latestStatuses.values());
  }

  async getServiceHistory(serviceId: string) {
    return this.checksRepo.find({
      where: { serviceId },
      order: { checkedAt: 'DESC' },
      take: 100,
    });
  }
}
