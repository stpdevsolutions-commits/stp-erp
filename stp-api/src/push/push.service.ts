import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';

/** Máximo de dispositivos por usuario; al pasarse se descartan los menos usados. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export interface PushPayload {
  title: string;
  body?: string;
  /** Ruta interna del ERP (empieza con "/"). */
  url?: string;
  /** Agrupa/reemplaza notificaciones del mismo asunto. */
  tag?: string;
}

/**
 * Solo se aceptan endpoints de los servicios de push reales de los navegadores: sin esta lista, un
 * usuario autenticado podría hacer que el servidor mande peticiones a cualquier URL (SSRF ciego).
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === 'https:' &&
      !u.port &&
      !u.username &&
      PUSH_HOSTS.some((re) => re.test(u.hostname))
    );
  } catch {
    return false;
  }
}

const clip = (s: string | undefined, n: number): string | undefined =>
  s === undefined ? undefined : s.length > n ? `${s.slice(0, n - 1)}…` : s;

/**
 * Web Push (VAPID) de la PWA (ERP-58). Reglas: nunca lanza ni bloquea a quien notifica, y sin claves
 * VAPID en el entorno queda desactivado (no-op) con un solo aviso en el log.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private publicKey: string | null = null;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subs: Repository<PushSubscription>,
    config: ConfigService,
  ) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT');
    if (!pub || !priv || !subject) {
      this.logger.warn(
        'Web Push desactivado: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT.',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject, pub, priv);
      this.publicKey = pub;
    } catch (err) {
      this.logger.warn(
        `Web Push desactivado: claves VAPID no válidas (${(err as Error).message}).`,
      );
    }
  }

  get enabled(): boolean {
    return this.publicKey !== null;
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  /** Registra (o reasigna, si el mismo dispositivo cambió de usuario) una suscripción. */
  async subscribe(
    userId: string,
    sub: { endpoint: string; p256dh: string; auth: string },
    userAgent?: string,
  ): Promise<void> {
    await this.subs.upsert(
      {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: clip(userAgent, 300) ?? null,
        lastUsedAt: new Date(),
      },
      ['endpoint'],
    );
    // Tope por usuario: se conservan las más recientes.
    const mine = await this.subs.find({
      where: { userId },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
      select: { id: true },
    });
    if (mine.length > MAX_SUBSCRIPTIONS_PER_USER) {
      await this.subs.delete(
        mine.slice(MAX_SUBSCRIPTIONS_PER_USER).map((s) => s.id),
      );
    }
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subs.delete({ userId, endpoint });
  }

  /**
   * Manda la notificación a todos los dispositivos de los usuarios. La promesa nunca se rechaza: quien
   * la llama desde una ruta crítica debe usar `void this.push.notifyUsers(...)`.
   */
  async notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    try {
      const rows = await this.subs.find({
        where: { userId: In([...new Set(userIds)]) },
      });
      if (rows.length === 0) return;
      const url =
        payload.url &&
        payload.url.startsWith('/') &&
        !payload.url.startsWith('//')
          ? payload.url
          : '/dashboard/mensajes';
      const body = JSON.stringify({
        title: clip(payload.title, 80) ?? 'STP ERP',
        body: clip(payload.body, 140),
        url,
        tag: clip(payload.tag, 64),
      });
      const gone: string[] = [];
      const ok: string[] = [];
      await Promise.all(
        rows.map(async (row) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: row.endpoint,
                keys: { p256dh: row.p256dh, auth: row.auth },
              },
              body,
              {
                TTL: 60 * 60,
                urgency: 'high',
                timeout: 10_000,
              },
            );
            ok.push(row.id);
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(row.id);
            else
              this.logger.warn(
                `Push no enviado (estado ${status ?? 'sin respuesta'}).`,
              );
          }
        }),
      );
      if (gone.length) await this.subs.delete(gone);
      if (ok.length)
        await this.subs.update({ id: In(ok) }, { lastUsedAt: new Date() });
    } catch (err) {
      this.logger.error(`Fallo enviando push: ${(err as Error).message}`);
    }
  }
}
