import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
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
import { parseWebhook, previewOf, ParsedInbound, ParsedStatus } from './whatsapp-parse';
import { WA_TEMPLATES } from './wa-templates';
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

  constructor(
    @InjectRepository(WaContact) private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaMessage) private readonly messages: Repository<WaMessage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly whatsapp: WhatsappService,
    private readonly inbox: WhatsappInboxService,
    private readonly appNotifications: AppNotificationsService,
    config: ConfigService,
  ) {
    this.telegramToken = config.get<string>('HERMES_TELEGRAM_BOT_TOKEN');
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
      await this.messages.save(
        this.messages.create({
          contactId: contact.id,
          waId: wamid,
          direction: MessageDirection.OUT,
          type: String(payload.type ?? 'text'),
          body,
          status: 'sent',
        }),
      );
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
      .set({
        lastInboundAt: m.sentAt,
        lastMessageAt: m.sentAt,
        lastMessagePreview: preview,
        awaitingReply: true,
        unreadCount: () => '"unreadCount" + 1',
      })
      .where('id = :id', { id: contact.id })
      .execute();

    await this.alertInbound(contact, m.profileName ?? contact.name, phone, preview, isNew);
  }

  private async applyStatus(s: ParsedStatus): Promise<void> {
    const msg = await this.messages.findOne({ where: { waId: s.waId } });
    if (!msg || msg.direction !== MessageDirection.OUT) return;
    if (s.status === 'failed') {
      await this.messages.update(msg.id, { status: 'failed', error: s.error ?? 'Meta no pudo entregar el mensaje' });
      return;
    }
    if ((STATUS_RANK[s.status] ?? 0) > (STATUS_RANK[msg.status] ?? 0)) {
      await this.messages.update(msg.id, { status: s.status });
    }
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
    let wamid: string;
    try {
      ({ wamid } = await this.whatsapp.sendTextTracked(c.phone, text));
    } catch (err) {
      throw new BadGatewayException(`WhatsApp no aceptó el mensaje: ${(err as Error).message}`);
    }
    return this.afterHumanSend(c, userId, { waId: wamid, type: 'text', body: text });
  }

  async sendTemplate(userId: string, id: string, name: string, params: string[]) {
    const c = await this.mustExist(id);
    const tpl = WA_TEMPLATES.find((t) => t.name === name);
    if (!tpl) throw new BadRequestException('Plantilla desconocida');
    const clean = params.map(flatParam);
    if (clean.length !== tpl.params.length || clean.some((p) => !p)) {
      throw new BadRequestException(`La plantilla necesita ${tpl.params.length} datos, todos con texto`);
    }
    let wamid: string;
    try {
      ({ wamid } = await this.whatsapp.sendTemplateTracked(c.phone, tpl.name, 'es', clean));
    } catch (err) {
      throw new BadGatewayException(`WhatsApp no aceptó la plantilla: ${(err as Error).message}`);
    }
    return this.afterHumanSend(c, userId, { waId: wamid, type: 'template', body: tpl.render(clean), templateName: tpl.name });
  }

  private async afterHumanSend(
    c: WaContact,
    userId: string,
    m: { waId: string; type: string; body: string; templateName?: string; filename?: string },
  ) {
    const saved = await this.messages.save(
      this.messages.create({
        contactId: c.id,
        waId: m.waId,
        direction: MessageDirection.OUT,
        type: m.type,
        body: m.body,
        templateName: m.templateName,
        filename: m.filename,
        status: 'sent',
        sentById: userId,
      }),
    );
    await this.contacts.update(c.id, {
      lastMessageAt: saved.sentAt,
      lastMessagePreview: previewOf(m.type, m.body),
      awaitingReply: false,
      unreadCount: 0,
      escalatedAt: NULL,
      // Quien contesta se queda con la conversación si nadie la había tomado.
      assignedToId: c.assignedToId ?? userId,
      stage: c.stage === LeadStage.NEW ? LeadStage.QUALIFYING : c.stage,
    });
    return { id: saved.id, sentAt: saved.sentAt, status: saved.status };
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
    let wamid: string;
    try {
      ({ wamid } = await this.whatsapp.sendMediaTracked(c.phone, { buffer: file.buffer, mime, filename, caption }));
    } catch (err) {
      throw new BadGatewayException(`WhatsApp no aceptó el archivo: ${(err as Error).message}`);
    }
    const rel = path.posix.join('whatsapp', c.id, `${randomUUID()}${EXT_BY_MIME[mime]}`);
    const abs = path.join(uploadRoot(), rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.buffer);
    const res = await this.afterHumanSend(c, userId, {
      waId: wamid,
      type: mime.startsWith('image/') ? 'image' : 'document',
      body: caption?.trim() ?? '',
      filename,
    });
    await this.messages.update(res.id, { mediaPath: rel, mime });
    return res;
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
    await this.mustExist(id);
    await this.contacts.update(id, { assignedToId: userId });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.mustExist(id);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto as Record<string, unknown>)) if (v !== undefined) patch[k] = v;
    if (patch.assignedToId) {
      const u = await this.users.findOne({ where: { id: patch.assignedToId as string, isActive: true } });
      if (!u || !hasModuleAccess(u.role, 'mensajes', 'view')) throw new BadRequestException('Esa persona no tiene acceso a la bandeja');
    }
    if (patch.clientId && !(await this.clients.findOne({ where: { id: patch.clientId as string }, select: { id: true } }))) {
      throw new BadRequestException('Cliente no encontrado');
    }
    if (Object.keys(patch).length) await this.contacts.update(id, patch);
    return this.findOne(id);
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  private async mustExist(id: string): Promise<WaContact> {
    const c = await this.contacts.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversación no encontrada');
    return c;
  }

  private async isStaff(phone: string): Promise<boolean> {
    const users = await this.users.createQueryBuilder('u').where('u.isActive = true AND u.phone IS NOT NULL').getMany();
    return users.some((u) => normalizePhone(u.phone) === phone);
  }

  /** Cliente del ERP cuyo teléfono (o el de su contacto) coincide con el número. */
  private async findClientId(phone: string): Promise<string | null> {
    const rows = await this.clients
      .createQueryBuilder('c')
      .select(['c.id', 'c.phone', 'c.contactPhone'])
      .where('c.phone IS NOT NULL OR c.contactPhone IS NOT NULL')
      .getMany();
    const hit = rows.find(
      (c) => (c.phone && normalizePhone(c.phone) === phone) || (c.contactPhone && normalizePhone(c.contactPhone) === phone),
    );
    return hit?.id ?? null;
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
