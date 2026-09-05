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
  { id: 'ecf-api', name: 'eCF API', url: 'ecf-api:3000', type: 'tcp' },
  { id: 'ecf-frontend', name: 'eCF Frontend', url: 'http://ecf-frontend:3000', type: 'http' },
  { id: 'mi-dia-api', name: 'Mi Día API', url: 'mi-dia-api:3000', type: 'tcp' },
  { id: 'mi-dia-frontend', name: 'Mi Día', url: 'http://mi-dia-frontend:80', type: 'http' },
  { id: 'tickets-api', name: 'Tickets API', url: 'http://stp-tickets-api:3003/health', type: 'http' },
  { id: 'tickets-web', name: 'Tickets', url: 'http://stp-tickets-web:3000', type: 'http' },
  { id: 'immich', name: 'Immich', url: 'immich_server:2283', type: 'tcp' },
];

@Injectable()
export class ServicesService implements OnModuleInit {
  private readonly logger = new Logger(ServicesService.name);
  private latestStatuses = new Map<string, ServiceStatus>();
  /** Último estado *confirmado* (ya alertado o recuperado de la BD) por servicio. */
  private previousStatuses = new Map<string, string>();
  /** Chequeos fallidos consecutivos por servicio, para no alertar por un blip. */
  private failureCounts = new Map<string, number>();

  /** Fallos seguidos antes de dar un servicio por caído (1 chequeo = 1 minuto). */
  private static readonly DOWN_THRESHOLD = 2;

  constructor(
    @InjectRepository(ServiceCheck)
    private readonly checksRepo: Repository<ServiceCheck>,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.restorePreviousStatuses();
    setTimeout(() => this.checkAll(), 2000);
  }

  /**
   * Rehidrata el último estado conocido de cada servicio desde `service_checks`.
   *
   * Sin esto el Map arranca vacío tras cada reinicio y la primera transición no
   * se alertaba nunca: cuando el server volvía de un apagón, Vigía anotaba la API
   * como caída en silencio y al minuto siguiente mandaba solo "Recuperado".
   */
  private async restorePreviousStatuses() {
    for (const svc of DEFAULT_SERVICES) {
      const last = await this.checksRepo.findOne({
        where: { serviceId: svc.id },
        order: { checkedAt: 'DESC' },
      });
      if (last) this.previousStatuses.set(svc.id, last.status);
    }
    this.logger.log(`Estado previo restaurado para ${this.previousStatuses.size} servicios`);
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

  /**
   * Registra la alerta y la manda por Telegram **y** email.
   *
   * `allSettled` a propósito: antes solo salía por Telegram y una excepción de
   * ese canal se llevaba por delante el aviso entero. Ahora si un canal falla,
   * el otro sale igual.
   */
  private async emitAlert(svc: ServiceDef, type: 'down' | 'up', latency: number | null) {
    const hora = new Date().toLocaleString('es-DO');
    const caido = type === 'down';

    const msg = caido
      ? `🔴 <b>Servicio Caído</b>\n📌 <b>Servicio:</b> ${svc.name}\n⏰ <b>Hora:</b> ${hora}\n🌐 <b>URL:</b> ${svc.url}`
      : `✅ <b>Servicio Recuperado</b>\n📌 <b>Servicio:</b> ${svc.name}\n⏰ <b>Hora:</b> ${hora}\n⏱️ <b>Latencia:</b> ${latency ?? '-'}ms`;

    await this.alerts.createAlert(
      svc.id,
      svc.name,
      type,
      `${svc.name} está ${caido ? 'caído' : 'recuperado'}`,
    );

    const asunto = caido ? `🔴 ${svc.name} está caído` : `✅ ${svc.name} se recuperó`;
    const results = await Promise.allSettled([
      this.notifications.sendTelegram(msg),
      this.notifications.sendEmail(asunto, msg.replace(/\n/g, '<br>')),
    ]);

    const canales = ['Telegram', 'email'];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.error(`No se pudo alertar por ${canales[i]}: ${r.reason}`);
      }
    });

    this.logger.warn(`${svc.name} → ${type}`);
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

    if (result.status === 'down') {
      const fails = (this.failureCounts.get(svc.id) ?? 0) + 1;
      this.failureCounts.set(svc.id, fails);

      // Se alerta al cruzar el umbral y solo si no se había dado ya por caído.
      // Con prev === undefined (sin historial) también entra: es justo el caso
      // que antes se perdía.
      if (fails >= ServicesService.DOWN_THRESHOLD && prev !== 'down') {
        await this.emitAlert(svc, 'down', result.latency);
        this.previousStatuses.set(svc.id, 'down');
      }
    } else {
      this.failureCounts.set(svc.id, 0);
      if (prev === 'down') {
        await this.emitAlert(svc, 'up', result.latency);
      }
      this.previousStatuses.set(svc.id, 'up');
    }
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
