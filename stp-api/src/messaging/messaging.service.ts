import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { WaContact, LeadStage } from './entities/wa-contact.entity';
import { WaMessage, MessageDirection } from './entities/wa-message.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { WhatsappService, normalizePhone } from '../notifications/whatsapp.service';
import { WhatsappInboxService } from '../notifications/whatsapp-inbox.service';
import { AppNotificationsService } from '../notifications/app-notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { hasModuleAccess } from '../common/access/module-permissions';
import { escapeLike } from '../common/like-escape';
import { auditLog } from '../common/audit-log';
import { parseWebhook, previewOf, ParsedInbound, ParsedStatus } from './whatsapp-parse';
import { WA_TEMPLATES } from './wa-templates';
import { PushService } from '../push/push.service';
import { QueryContactsDto, QueryMessagesDto, UpdateContactDto } from './dto/messaging.dto';

/** Se usa para dejar en NULL una columna que el tipo de la entidad no declara como anulable. */
const NULL = null as never;

/** Cuentas de integración y de prueba (Hermes, QA): no son personas a quienes asignar una conversación. */
const SERVICE_ACCOUNTS = /(^hermes-agent@|\.local$)/i;

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Mínimo entre dos avisos por el mismo contacto, para no avisar mensaje por mensaje. */
const ALERT_EVERY_MS = 10 * 60 * 1000;
/** Tiempo sin atender (en horario laboral) antes de recordarlo por Telegram. */
const ESCALATE_AFTER_MS = 30 * 60 * 1000;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
/** Un mensaje idéntico (mismo usuario, contacto y contenido) dentro de este lapso se toma por doble clic. */
const DUPLICATE_WINDOW_MS = 5_000;
/** Avisos de estado que llegaron antes de que se guardara el id del mensaje: se recuerdan unos minutos. */
const ORPHAN_TTL_MS = 5 * 60_000;
const ORPHAN_MAX = 500;
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/amr': '.amr',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
};

/** Hora y día de la semana en República Dominicana (UTC-4 todo el año, sin horario de verano). */
function rdClock(d: Date): { dow: number; hour: number } {
  const r = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  return { dow: r.getUTCDay(), hour: r.getUTCHours() + r.getUTCMinutes() / 60 };
}

/** Lunes a viernes 8:00-18:00 y sábado 8:00-13:00 (hora de RD). */
export function isWorkingHours(d: Date): boolean {
  const { dow, hour } = rdClock(d);
  if (dow === 0) return false;
  if (dow === 6) return hour >= 8 && hour < 13;
  return hour >= 8 && hour < 18;
}

/** Las 8:00 de RD del día de `d`, para no contar la noche como tiempo sin atender. */
function openingOf(d: Date): Date {
  const { hour } = rdClock(d);
  return new Date(d.getTime() - (hour - 8) * 60 * 60 * 1000);
}

function flatParam(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);
  private readonly telegramToken?: string;
  private readonly telegramChat?: string;
  private readonly erpUrl: string;
  private readonly recentSends = new Map<string, number>();
  private readonly inboundListeners: ((contactId: string, messageId: string) => void)[] = [];
  private readonly orphanStatuses = new Map<string, { status: string; error?: string; at: number }>();

  constructor(
    @InjectRepository(WaContact) private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaMessage) private readonly messages: Repository<WaMessage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly whatsapp: WhatsappService,
    private readonly inbox: WhatsappInboxService,
    private readonly appNotifications: AppNotificationsService,
    config: ConfigService,
    @Optional() private readonly push?: PushService,
  ) {
    this.telegramToken = config.get<string>('MESSAGING_TELEGRAM_BOT_TOKEN');
    this.telegramChat = config.get<string>('TELEGRAM_CHAT_ID');
    this.erpUrl = config.get<string>('ERP_PUBLIC_URL') ?? 'https://erp.stpsoluciones.com';
  }

  onModuleInit(): void {
    this.inbox.registerRaw((body) => this.ingest(body));
    // Guarda también lo que contesta solo el flujo de facturas (acuse a números desconocidos).
    this.whatsapp.setOutboundRecorder(async ({ to, wamid, payload }) => {
      const contact = await this.contacts.findOne({ where: { phone: to } });
      if (!contact) return; // Solo se registran las conversaciones con leads, no los avisos a colaboradores.
      const body = outboundBody(payload);
      const saved = await this.messages.save(
        this.messages.create({
          contactId: contact.id,
          waId: wamid,
          direction: MessageDirection.OUT,
          type: String(payload.type ?? 'text'),
          body,
          status: 'sent',
        }),
      );
      await this.applyOrphan(saved.id, wamid);
      await this.contacts.update(contact.id, { lastMessageAt: new Date(), lastMessagePreview: previewOf('text', body) });
    });
  }

  // ── Entrada desde el webhook ───────────────────────────────────────────────

  /** Guarda los mensajes entrantes y aplica los avisos de estado. Nunca lanza: un fallo aquí no debe tumbar el webhook. */
  async ingest(body: unknown): Promise<void> {
    const { messages, statuses } = parseWebhook(body);
    for (const m of messages) {
      try {
        await this.ingestMessage(m);
      } catch (err) {
        this.logger.error(`No se pudo guardar el mensaje ${m.waId}: ${(err as Error).message}`);
      }
    }
    for (const s of statuses) {
      try {
        await this.applyStatus(s);
      } catch (err) {
        this.logger.error(`No se pudo aplicar el estado de ${s.waId}: ${(err as Error).message}`);
      }
    }
  }

  private async ingestMessage(m: ParsedInbound): Promise<void> {
    const phone = normalizePhone(m.from);
    if (!phone) return;
    // Los colaboradores escriben a este número para registrar facturas: eso no es un lead.
    if (await this.isStaff(phone)) return;
    if (await this.messages.findOne({ where: { waId: m.waId }, select: { id: true } })) return;

    let contact = await this.contacts.findOne({ where: { phone } });
    const isNew = !contact;
    if (!contact) {
      try {
        contact = await this.contacts.save(
          this.contacts.create({ phone, name: m.profileName, clientId: (await this.findClientId(phone)) ?? undefined }),
        );
      } catch {
        // Dos mensajes seguidos de un número nuevo: el otro ganó la carrera de creación.
        contact = await this.contacts.findOneOrFail({ where: { phone } });
      }
    } else {
      const patch: Partial<WaContact> = {};
      if (!contact.name && m.profileName) patch.name = m.profileName;
      if (!contact.clientId) {
        const clientId = await this.findClientId(phone);
        if (clientId) patch.clientId = clientId;
      }
      if (Object.keys(patch).length) await this.contacts.update(contact.id, patch);
    }

    const saved = await this.messages.save(
      this.messages.create({
        contactId: contact.id,
        waId: m.waId,
        direction: MessageDirection.IN,
        type: m.type,
        body: m.body,
        mediaId: m.mediaId,
        mime: m.mime,
        filename: m.filename,
        status: 'received',
        sentAt: m.sentAt,
      }),
    );

    if (m.mediaId) await this.storeMedia(saved, contact.id);

    const preview = previewOf(m.type, m.body);
    await this.contacts
      .createQueryBuilder()
      .update(WaContact)
      // Los webhooks llegan desordenados: un mensaje más viejo suma al contador pero no hace retroceder
      // la última actividad, la vista previa ni la marca de "espera respuesta".
      .set({
        lastInboundAt: () => 'GREATEST("lastInboundAt", :t)',
        lastMessageAt: () => 'GREATEST("lastMessageAt", :t)',
        lastMessagePreview: () => 'CASE WHEN "lastMessageAt" IS NULL OR "lastMessageAt" <= :t THEN :p ELSE "lastMessagePreview" END',
        awaitingReply: () => 'CASE WHEN "lastMessageAt" IS NULL OR "lastMessageAt" <= :t THEN true ELSE "awaitingReply" END',
        unreadCount: () => '"unreadCount" + 1',
      })
      .where('id = :id', { id: contact.id })
      .setParameters({ t: m.sentAt, p: preview })
      .execute();

    await this.alertInbound(contact, m.profileName ?? contact.name, phone, preview, isNew);

    // Oyentes (copiloto de IA): nunca deben romper ni retrasar la entrada del mensaje.
    for (const fn of this.inboundListeners) {
      try {
        fn(contact.id, saved.id);
      } catch (err) {
        this.logger.error(`Oyente de mensajes entrantes falló: ${(err as Error).message}`);
      }
    }
  }

  /** Registra una función a la que se avisa (sin esperarla) cada vez que se guarda un mensaje entrante de un contacto. */
  onInbound(fn: (contactId: string, messageId: string) => void): void {
    this.inboundListeners.push(fn);
  }

  private async applyStatus(s: ParsedStatus): Promise<void> {
    const msg = await this.messages.findOne({ where: { waId: s.waId } });
    if (!msg) {
      this.rememberOrphan(s);
      return;
    }
    if (msg.direction !== MessageDirection.OUT) return;
    await this.applyStatusTo(msg, s.status, s.error);
  }

  private async applyStatusTo(msg: WaMessage, status: string, error?: string): Promise<void> {
    if (status === 'failed') {
      await this.messages.update(msg.id, { status: 'failed', error: error ?? 'Meta no pudo entregar el mensaje' });
      return;
    }
    if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[msg.status] ?? 0)) {
      await this.messages.update(msg.id, { status });
    }
  }

  /** Guarda un aviso de estado cuyo mensaje aún no existe (el envío a Meta todavía no terminó de registrarse). */
  private rememberOrphan(s: ParsedStatus): void {
    const now = Date.now();
    for (const [k, v] of this.orphanStatuses) if (now - v.at > ORPHAN_TTL_MS) this.orphanStatuses.delete(k);
    if (this.orphanStatuses.size >= ORPHAN_MAX) return;
    const prev = this.orphanStatuses.get(s.waId);
    const better = s.status === 'failed' || (STATUS_RANK[s.status] ?? 0) > (STATUS_RANK[prev?.status ?? ''] ?? 0);
    if (!prev || better) this.orphanStatuses.set(s.waId, { status: s.status, error: s.error, at: now });
  }

  /** Aplica al mensaje recién guardado el aviso de estado que llegó antes que su id. */
  private async applyOrphan(messageId: string, waId: string | undefined): Promise<void> {
    if (!waId) return;
    const o = this.orphanStatuses.get(waId);
    if (!o) return;
    this.orphanStatuses.delete(waId);
    const msg = await this.messages.findOne({ where: { id: messageId } });
    if (msg) await this.applyStatusTo(msg, o.status, o.error);
  }

  /** Baja el adjunto de Meta y lo guarda en disco: la dirección que da Meta caduca a los pocos minutos. */
  private async storeMedia(msg: WaMessage, contactId: string): Promise<void> {
    try {
      const media = await this.whatsapp.downloadMedia(msg.mediaId, MAX_MEDIA_BYTES);
      if (!media) return;
      const mime = media.mime.split(';')[0].trim().toLowerCase();
      const ext = EXT_BY_MIME[mime];
      if (!ext) return; // Tipo que no se guarda (ejecutables, etc.).
      const rel = path.posix.join('whatsapp', contactId, `${randomUUID()}${ext}`);
      const abs = path.join(uploadRoot(), rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, media.buffer);
      await this.messages.update(msg.id, { mediaPath: rel, mime });
    } catch (err) {
      this.logger.error(`No se pudo guardar el adjunto ${msg.mediaId}: ${(err as Error).message}`);
    }
  }

  // ── Avisos ─────────────────────────────────────────────────────────────────

  private async alertInbound(
    contact: WaContact,
    name: string | undefined,
    phone: string,
    preview: string,
    isNew: boolean,
  ): Promise<void> {
    const last = contact.lastAlertAt?.getTime() ?? 0;
    if (!isNew && Date.now() - last < ALERT_EVERY_MS) return;
    await this.contacts.update(contact.id, { lastAlertAt: new Date() });

    const who = name ? `${name} (+${phone})` : `+${phone}`;
    const title = isNew ? `Nuevo contacto de WhatsApp: ${who}` : `Mensaje de ${who}`;
    const link = `/dashboard/mensajes?c=${contact.id}`;
    if (contact.assignedToId) {
      await this.appNotifications.notifyUser(
        contact.assignedToId,
        NotificationType.MESSAGE_RECEIVED,
        title,
        preview,
        link,
      );
    } else {
      await this.appNotifications.notifyRoles(
        [UserRole.ADMIN, UserRole.MANAGER],
        NotificationType.MESSAGE_RECEIVED,
        title,
        preview,
        link,
      );
    }
    this.telegram(`${title}\n${preview}\n${this.erpUrl}${link}`);
    void this.pushInbox(contact.assignedToId, {
      title: isNew ? `Nuevo contacto: ${name ?? 'WhatsApp'}` : `Mensaje de ${name ?? 'WhatsApp'}`,
      body: preview,
      url: link,
      tag: `wa-${contact.id}`,
    });
  }

  /** Recordatorio cada 5 min, solo en horario laboral: conversaciones sin atender hace más de 30 min. */
  @Cron('*/5 * * * *')
  async escalateUnattended(): Promise<void> {
    const now = new Date();
    if (!isWorkingHours(now)) return;
    try {
      const waiting = await this.contacts.find({
        where: { awaitingReply: true, escalatedAt: IsNull() },
        order: { lastInboundAt: 'ASC' },
        take: 50,
      });
      const opening = openingOf(now).getTime();
      for (const c of waiting) {
        if (!c.lastInboundAt) continue;
        // La noche y los domingos no cuentan: el reloj arranca al abrir.
        const since = Math.max(c.lastInboundAt.getTime(), opening);
        if (now.getTime() - since < ESCALATE_AFTER_MS) continue;
        await this.contacts.update(c.id, { escalatedAt: now });
        const minutes = Math.round((now.getTime() - since) / 60000);
        const who = c.name ? `${c.name} (+${c.phone})` : `+${c.phone}`;
        const owner = c.assignedToId ? 'Tiene dueño pero no ha respondido.' : 'Nadie la ha tomado.';
        this.telegram(
          `WhatsApp sin atender hace ${minutes} min: ${who}\n${c.lastMessagePreview ?? ''}\n${owner}\n${this.erpUrl}/dashboard/mensajes?c=${c.id}`,
        );
        void this.pushInbox(c.assignedToId, {
          title: `Sin responder hace ${minutes} min`,
          body: `${c.name ?? 'Contacto'}: ${c.lastMessagePreview ?? ''}`,
          url: `/dashboard/mensajes?c=${c.id}`,
          tag: `wa-wait-${c.id}`,
        });
        if (c.assignedToId) {
          await this.appNotifications.notifyUser(
            c.assignedToId,
            NotificationType.MESSAGE_RECEIVED,
            `Sin responder hace ${minutes} min: ${who}`,
            c.lastMessagePreview ?? undefined,
            `/dashboard/mensajes?c=${c.id}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Fallo revisando conversaciones sin atender: ${(err as Error).message}`);
    }
  }

  /**
   * Web Push (ERP-58): al asignado o, si no hay, a todos con acceso a la bandeja (sin cuentas de servicio).
   * El texto no lleva el teléfono. Nunca lanza ni se espera en la ruta crítica.
   */
  private async pushInbox(
    assignedToId: string | null | undefined,
    msg: { title: string; body: string; url: string; tag: string },
  ): Promise<void> {
    if (!this.push?.enabled) return;
    try {
      const users = await this.users.find({
        where: assignedToId ? { id: assignedToId, isActive: true } : { isActive: true },
      });
      const ids = users
        .filter((u) => hasModuleAccess(u.role, 'mensajes', 'view') && !SERVICE_ACCOUNTS.test(u.email))
        .map((u) => u.id);
      await this.push.notifyUsers(ids, { ...msg, body: msg.body.slice(0, 100) });
    } catch (err) {
      this.logger.error(`Push de la bandeja: ${(err as Error).message}`);
    }
  }

  private telegram(text: string): void {
    if (!this.telegramToken || !this.telegramChat) return;
    void fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: this.telegramChat, text }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: Error) => this.logger.error(`Telegram: ${err.message}`));
  }

  // ── Consultas ──────────────────────────────────────────────────────────────

  async list(userId: string, q: QueryContactsDto) {
    const qb = this.contacts
      .createQueryBuilder('c')
      .leftJoin('c.assignedTo', 'u')
      .leftJoin('c.client', 'cl')
      .addSelect(['u.id', 'u.firstName', 'u.lastName', 'cl.id', 'cl.name']);

    const filter = q.filter ?? 'all';
    if (filter === 'queue') {
      qb.andWhere('c.assignedToId IS NULL').andWhere('c.stage NOT IN (:...closed)', { closed: [LeadStage.WON, LeadStage.LOST] });
    } else if (filter === 'mine') {
      qb.andWhere('c.assignedToId = :userId', { userId });
    } else if (filter === 'waiting') {
      qb.andWhere('c.awaitingReply = true');
    }
    if (q.stage) qb.andWhere('c.stage = :stage', { stage: q.stage });
    if (q.search?.trim()) {
      const term = `%${escapeLike(q.search.trim())}%`;
      qb.andWhere('(c.name ILIKE :term OR c.phone LIKE :term OR cl.name ILIKE :term)', { term });
    }
    qb.orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST').take(q.limit ?? 100);

    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map((c) => this.toView(c)), total };
  }

  async summary(userId: string) {
    const [queue, mine, waiting] = await Promise.all([
      this.contacts.count({ where: { assignedToId: IsNull(), stage: In([LeadStage.NEW, LeadStage.QUALIFYING, LeadStage.VISIT_PENDING, LeadStage.VISIT_DONE, LeadStage.QUOTE_SENT]) } }),
      this.contacts.count({ where: { assignedToId: userId } }),
      this.contacts.count({ where: { awaitingReply: true } }),
    ]);
    return { queue, mine, waiting };
  }

  async findOne(id: string) {
    const c = await this.contacts.findOne({ where: { id }, relations: { assignedTo: true, client: true } });
    if (!c) throw new NotFoundException('Conversación no encontrada');
    return this.toView(c);
  }

  async thread(id: string, q: QueryMessagesDto) {
    await this.mustExist(id);
    const qb = this.messages.createQueryBuilder('m').where('m.contactId = :id', { id });
    if (q.before) qb.andWhere('m.sentAt < :before', { before: new Date(q.before) });
    const rows = await qb.orderBy('m.sentAt', 'DESC').take(q.limit ?? 100).getMany();
    return rows.reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      hasMedia: !!m.mediaPath,
      mime: m.mime,
      filename: m.filename,
      status: m.status,
      error: m.error,
      templateName: m.templateName,
      sentById: m.sentById,
      sentAt: m.sentAt,
    }));
  }

  async markRead(id: string) {
    await this.mustExist(id);
    await this.contacts.update(id, { unreadCount: 0 });
  }

  templates() {
    return WA_TEMPLATES.map((t) => ({ name: t.name, label: t.label, params: t.params, preview: t.render(t.params.map((p) => `{${p}}`)) }));
  }

  /** Personas del equipo a las que se puede asignar una conversación. */
  async agents() {
    const users = await this.users.find({ where: { isActive: true }, order: { firstName: 'ASC' } });
    return users
      .filter((u) => hasModuleAccess(u.role, 'mensajes', 'view') && !SERVICE_ACCOUNTS.test(u.email))
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role }));
  }

  async mediaFile(messageId: string): Promise<{ abs: string; mime: string; filename: string }> {
    const m = await this.messages.findOne({ where: { id: messageId } });
    if (!m?.mediaPath) throw new NotFoundException('Adjunto no encontrado');
    const root = path.resolve(uploadRoot());
    const abs = path.resolve(root, m.mediaPath);
    if (!abs.startsWith(root + path.sep)) throw new NotFoundException('Adjunto no encontrado');
    return { abs, mime: m.mime ?? 'application/octet-stream', filename: m.filename ?? path.basename(abs) };
  }

  // ── Acciones ───────────────────────────────────────────────────────────────

  async sendText(userId: string, id: string, text: string) {
    const c = await this.mustExist(id);
    if (!c.lastInboundAt || Date.now() - c.lastInboundAt.getTime() > WINDOW_MS) {
      throw new BadRequestException('Pasaron más de 24 h desde el último mensaje del cliente: envía una plantilla.');
    }
    return this.sendOutbound(
      c,
      userId,
      { type: 'text', body: text },
      async () => (await this.whatsapp.sendTextTracked(c.phone, text)).wamid,
      'WhatsApp no aceptó el mensaje',
    );
  }

  async sendTemplate(userId: string, id: string, name: string, params: string[]) {
    const c = await this.mustExist(id);
    const tpl = WA_TEMPLATES.find((t) => t.name === name);
    if (!tpl) throw new BadRequestException('Plantilla desconocida');
    const clean = params.map(flatParam);
    if (clean.length !== tpl.params.length || clean.some((p) => !p)) {
      throw new BadRequestException(`La plantilla necesita ${tpl.params.length} datos, todos con texto`);
    }
    return this.sendOutbound(
      c,
      userId,
      { type: 'template', body: tpl.render(clean), templateName: tpl.name },
      async () => (await this.whatsapp.sendTemplateTracked(c.phone, tpl.name, 'es', clean)).wamid,
      'WhatsApp no aceptó la plantilla',
    );
  }

  /**
   * Envía un mensaje de una persona del equipo. El mensaje se guarda ANTES de salir hacia Meta, con estado
   * 'sending': así el aviso de entregado/leído (que puede llegar antes de que Meta termine de responder)
   * siempre encuentra su fila, y un fallo o un corte del servidor deja rastro en vez de un envío sin registro.
   */
  private async sendOutbound(
    c: WaContact,
    userId: string,
    m: { type: string; body: string; templateName?: string; filename?: string; mediaPath?: string; mime?: string },
    send: () => Promise<string>,
    failLabel: string,
    dedupeExtra = '',
  ) {
    const key = [userId, c.id, m.type, m.templateName ?? '', m.filename ?? '', dedupeExtra, m.body].join('|');
    this.claimSend(key);
    let saved: WaMessage;
    try {
      saved = await this.messages.save(
        this.messages.create({
          contactId: c.id,
          direction: MessageDirection.OUT,
          type: m.type,
          body: m.body,
          templateName: m.templateName,
          filename: m.filename,
          mediaPath: m.mediaPath,
          mime: m.mime,
          status: 'sending',
          sentById: userId,
        }),
      );
    } catch (err) {
      this.recentSends.delete(key);
      throw err;
    }

    let wamid: string;
    try {
      wamid = await send();
    } catch (err) {
      const reason = (err as Error).message;
      this.recentSends.delete(key); // Falló: se puede reintentar enseguida.
      await this.messages
        .update(saved.id, { status: 'failed', error: reason.slice(0, 500) })
        .catch((e: Error) => this.logger.error(`No se pudo marcar como fallido el mensaje ${saved.id}: ${e.message}`));
      throw new BadGatewayException(`${failLabel}: ${reason}`);
    }

    await this.messages.update(saved.id, { waId: wamid, status: 'sent' });
    await this.applyOrphan(saved.id, wamid);

    const patch = {
      lastMessagePreview: previewOf(m.type, m.body),
      awaitingReply: false,
      unreadCount: 0,
      escalatedAt: NULL,
      // Quien contesta se queda con la conversación si nadie la había tomado.
      assignedToId: c.assignedToId ?? userId,
      stage: c.stage === LeadStage.NEW ? LeadStage.QUALIFYING : c.stage,
    };
    await this.contacts
      .createQueryBuilder()
      .update(WaContact)
      // GREATEST como en la entrada: un envío con reloj atrasado no hace retroceder la última actividad.
      .set({ ...patch, lastMessageAt: () => 'GREATEST("lastMessageAt", :sentAt)' })
      .where('id = :id', { id: c.id })
      .setParameters({ sentAt: saved.sentAt })
      .execute();
    if (!c.assignedToId) auditLog(userId, 'whatsapp.auto-assign', { contactId: c.id });
    if (patch.stage !== c.stage) auditLog(userId, 'whatsapp.stage', { contactId: c.id, from: c.stage, to: patch.stage });

    const row = await this.messages.findOne({ where: { id: saved.id }, select: { id: true, sentAt: true, status: true } });
    return { id: saved.id, sentAt: saved.sentAt, status: row?.status ?? 'sent' };
  }

  /** Rechaza un envío idéntico (mismo usuario, contacto y contenido) repetido dentro de 5 s. */
  private claimSend(key: string): void {
    const now = Date.now();
    for (const [k, at] of this.recentSends) if (now - at > DUPLICATE_WINDOW_MS) this.recentSends.delete(k);
    if (this.recentSends.has(key)) {
      throw new ConflictException('Ese mismo mensaje se acaba de enviar. Espera unos segundos si de verdad quieres repetirlo.');
    }
    this.recentSends.set(key, now);
  }

  /** Foto o PDF desde la bandeja: se valida el contenido real (no solo el tipo declarado), se guarda y se envía. */
  async sendAttachment(
    userId: string,
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
    caption?: string,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo');
    const c = await this.mustExist(id);
    if (!c.lastInboundAt || Date.now() - c.lastInboundAt.getTime() > WINDOW_MS) {
      throw new BadRequestException('Pasaron más de 24 h desde el último mensaje del cliente: solo se pueden enviar plantillas.');
    }
    const mime = sniffMime(file.buffer);
    if (!mime) throw new BadRequestException('Solo se pueden enviar fotos (JPG, PNG, WEBP) y PDF');
    const filename = path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 100) || `archivo${EXT_BY_MIME[mime]}`;
    const text = caption?.trim() ?? '';
    // La huella del contenido entra en la clave anti-duplicados: dos fotos distintas con el mismo nombre no chocan.
    const digest = createHash('sha1').update(file.buffer).digest('hex');

    // El archivo se guarda en disco ANTES de enviarlo: el mensaje queda registrado con su adjunto aunque Meta falle.
    const rel = path.posix.join('whatsapp', c.id, `${randomUUID()}${EXT_BY_MIME[mime]}`);
    const abs = path.join(uploadRoot(), rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.buffer);
    try {
      return await this.sendOutbound(
        c,
        userId,
        { type: mime.startsWith('image/') ? 'image' : 'document', body: text, filename, mediaPath: rel, mime },
        async () => (await this.whatsapp.sendMediaTracked(c.phone, { buffer: file.buffer, mime, filename, caption })).wamid,
        'WhatsApp no aceptó el archivo',
        digest,
      );
    } catch (err) {
      // Si fue un duplicado rechazado, ningún mensaje apunta al archivo recién escrito: se borra.
      if (err instanceof ConflictException) await fs.rm(abs, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  /** Búsqueda corta de clientes del ERP para enlazarlos a una conversación. */
  async searchClients(term: string) {
    const t = term.trim();
    if (!t) return [];
    const rows = await this.clients
      .createQueryBuilder('c')
      .select(['c.id', 'c.name', 'c.phone'])
      .where('c.name ILIKE :t', { t: `%${escapeLike(t)}%` })
      .orderBy('c.name', 'ASC')
      .take(8)
      .getMany();
    return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null }));
  }

  async take(userId: string, id: string) {
    const before = await this.mustExist(id);
    await this.contacts.update(id, { assignedToId: userId });
    auditLog(userId, 'whatsapp.take', { contactId: id, from: before.assignedToId ?? null, to: userId });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateContactDto, actorId?: string) {
    const before = await this.mustExist(id);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto as Record<string, unknown>)) if (v !== undefined) patch[k] = v;
    // Un campo de texto vaciado se guarda como NULL: así la lista cae al teléfono en vez de mostrar un título en blanco.
    for (const k of ['name', 'service', 'notes']) {
      if (typeof patch[k] === 'string' && !(patch[k] as string).trim()) patch[k] = NULL;
    }
    if (patch.assignedToId) {
      const u = await this.users.findOne({ where: { id: patch.assignedToId as string, isActive: true } });
      if (!u || !hasModuleAccess(u.role, 'mensajes', 'view')) throw new BadRequestException('Esa persona no tiene acceso a la bandeja');
    }
    if (patch.clientId && !(await this.clients.findOne({ where: { id: patch.clientId as string }, select: { id: true } }))) {
      throw new BadRequestException('Cliente no encontrado');
    }
    if (Object.keys(patch).length) await this.contacts.update(id, patch);
    if ('assignedToId' in patch && (patch.assignedToId ?? null) !== (before.assignedToId ?? null)) {
      auditLog(actorId, 'whatsapp.reassign', { contactId: id, from: before.assignedToId ?? null, to: patch.assignedToId ?? null });
    }
    if ('stage' in patch && patch.stage !== before.stage) {
      auditLog(actorId, 'whatsapp.stage', { contactId: id, from: before.stage, to: patch.stage });
    }
    return this.findOne(id);
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  private async mustExist(id: string): Promise<WaContact> {
    const c = await this.contacts.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversación no encontrada');
    return c;
  }

  /** ¿El número es de un usuario activo del ERP? Consulta indexada sobre `users.phoneNormalized`. */
  async isStaff(phone: string): Promise<boolean> {
    const p = normalizePhone(phone);
    if (!p) return false;
    return this.users.createQueryBuilder('u').where('u.isActive = true AND u.phoneNormalized = :p', { p }).getExists();
  }

  /** Cliente del ERP cuyo teléfono (o el de su contacto) coincide con el número. Consulta indexada. */
  async findClientId(phone: string): Promise<string | null> {
    const p = normalizePhone(phone);
    if (!p) return null;
    const row = await this.clients
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .where('c.phoneNormalized = :p OR c.contactPhoneNormalized = :p', { p })
      .orderBy('c.createdAt', 'ASC')
      .limit(1)
      .getRawOne<{ id: string }>();
    return row?.id ?? null;
  }

  private toView(c: WaContact) {
    const windowEndsAt = c.lastInboundAt ? new Date(c.lastInboundAt.getTime() + WINDOW_MS) : null;
    return {
      id: c.id,
      phone: c.phone,
      name: c.name,
      stage: c.stage,
      service: c.service,
      notes: c.notes,
      client: c.client ? { id: c.client.id, name: c.client.name } : null,
      assignedTo: c.assignedTo
        ? { id: c.assignedTo.id, name: `${c.assignedTo.firstName} ${c.assignedTo.lastName}`.trim() }
        : null,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: c.unreadCount,
      awaitingReply: c.awaitingReply,
      windowEndsAt,
      windowOpen: !!windowEndsAt && windowEndsAt.getTime() > Date.now(),
      createdAt: c.createdAt,
    };
  }
}

/** Tipo real por los primeros bytes del archivo: JPG, PNG, WEBP y PDF. */
function sniffMime(b: Buffer): string | null {
  if (b.length > 12) {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (b.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  }
  return null;
}

function uploadRoot(): string {
  return process.env.UPLOAD_PATH ?? '/app/uploads';
}

/** Texto visible de un mensaje libre saliente (texto o botones). */
function outboundBody(payload: Record<string, unknown>): string {
  const text = (payload.text as { body?: string } | undefined)?.body;
  if (text) return text;
  const inter = payload.interactive as { body?: { text?: string }; action?: { buttons?: { reply?: { title?: string } }[] } } | undefined;
  const buttons = inter?.action?.buttons?.map((b) => b.reply?.title).filter(Boolean);
  return [inter?.body?.text, buttons?.length ? `[${buttons.join(' · ')}]` : ''].filter(Boolean).join('\n');
}
