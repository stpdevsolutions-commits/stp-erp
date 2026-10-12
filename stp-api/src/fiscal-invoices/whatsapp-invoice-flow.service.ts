import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { WhatsappService, normalizePhone } from '../notifications/whatsapp.service';
import { InboundMessage, WhatsappInboxService } from '../notifications/whatsapp-inbox.service';
import { User } from '../users/entities/user.entity';
import { Project, ProjectStatus } from '../projects/entities/project.entity';
import { hasModuleAccess } from '../common/access/module-permissions';
import { getUploadRoot } from '../files/files.utils';
import { todayRD } from '../common/dates';
import { FiscalInvoicesService } from './fiscal-invoices.service';
import { EXPENSE_TYPES_606 } from './fiscal-invoice-rules';
import { SCAN_MAX_BYTES, SCAN_MIME_TYPES, ScanResult } from './invoice-scan';
import { CreateFiscalInvoiceDto } from './dto/fiscal-invoice.dto';
import { foldName } from './supplier-name';
import { decodeQrFromImage } from './qr-image';

const SESSION_TTL_MS = 20 * 60 * 1000;
const AUTOREPLY_EVERY_MS = 24 * 60 * 60 * 1000;
/** Tipo de gasto del 606 cuando la lectura no pudo deducirlo (se avisa para que se revise). */
const DEFAULT_EXPENSE_TYPE = '02';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' });

type Destination = { kind: 'project'; id: string; label: string } | { kind: 'general' } | { kind: 'none' };

interface Session {
  userId: string;
  scan: ScanResult;
  buffer: Buffer;
  mime: string;
  destination?: Destination;
  /** Búsqueda de proyecto en curso (para paginar los resultados). */
  search?: string;
  expiresAt: number;
}

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/**
 * Registrar una factura mandando su foto por WhatsApp (ticket ERP "Registrar facturas enviando la
 * foto por WhatsApp"). Solo reacciona a números guardados en la ficha de un usuario con acceso
 * de gestión al módulo de facturas; a cualquier otro número no le descarga nada. Nunca guarda sin
 * que la persona confirme con un botón, y el destino (proyecto, gasto general o sin asignar) se
 * elige en el chat.
 *
 * La conversación vive en memoria (20 min): si el servidor se reinicia a medias, se manda la foto
 * otra vez. Reutiliza el escáner y el alta de facturas de la pantalla "Escanear" del ERP.
 */
@Injectable()
export class WhatsappInvoiceFlowService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappInvoiceFlowService.name);
  private readonly sessions = new Map<string, Session>();
  private readonly autoReplied = new Map<string, number>();
  /** Remitentes cuya foto se está leyendo ahora mismo. */
  private readonly processing = new Set<string>();

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly inbox: WhatsappInboxService,
    private readonly invoices: FiscalInvoicesService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  onModuleInit(): void {
    this.inbox.register((m) => this.handle(m));
  }

  // ── Entrada ─────────────────────────────────────────────────────────────────

  async handle(msg: InboundMessage): Promise<void> {
    const user = await this.findUser(msg.from);
    if (!user) {
      await this.autoReply(msg.from);
      return;
    }
    if (!hasModuleAccess(user.role, 'facturas', 'manage')) {
      await this.whatsapp.sendText(msg.from, 'Tu usuario no tiene permiso para registrar facturas.');
      return;
    }

    this.dropExpired();

    if (msg.interactiveId) return this.onChoice(msg, user, msg.interactiveId);
    if (msg.type === 'image' || msg.type === 'document') return this.onFile(msg, user);
    if (msg.type === 'text') return this.onText(msg, user, (msg.text ?? '').trim());
    await this.whatsapp.sendText(msg.from, 'Mándame la foto o el PDF de una factura para registrarla.');
  }

  /** Usuario activo cuyo teléfono (en la ficha, en cualquier formato) coincide con el remitente. */
  private async findUser(from: string): Promise<User | null> {
    const wanted = normalizePhone(from);
    if (!wanted) return null;
    const candidates = await this.users
      .createQueryBuilder('u')
      .where('u.isActive = true AND u.phone IS NOT NULL')
      .getMany();
    return candidates.find((u) => normalizePhone(u.phone) === wanted) ?? null;
  }

  /** A un número desconocido (p. ej. un cliente) se le avisa una vez al día y no se hace nada más. */
  private async autoReply(from: string): Promise<void> {
    const last = this.autoReplied.get(from) ?? 0;
    if (Date.now() - last < AUTOREPLY_EVERY_MS) return;
    this.autoReplied.set(from, Date.now());
    const text =
      this.config.get<string>('WHATSAPP_AUTOREPLY_TEXT') ??
      'Gracias por comunicarte con Soluciones Técnicas Profesionales (STP). Recibimos tu mensaje y un miembro de nuestro equipo se pondrá en contacto contigo lo antes posible.';
    await this.whatsapp.sendText(from, text);
  }

  // ── Foto o PDF ──────────────────────────────────────────────────────────────

  /**
   * Una factura a la vez por persona: mientras una espera destino, o se está leyendo, una foto nueva
   * no la pisa (antes la segunda reemplazaba a la primera sin avisar).
   */
  private async onFile(msg: InboundMessage, user: User): Promise<void> {
    if (this.processing.has(msg.from)) {
      await this.whatsapp.sendText(msg.from, 'Todavía estoy leyendo tu foto anterior. Espera unos segundos y mándame la siguiente.');
      return;
    }
    const pending = this.sessions.get(msg.from);
    if (pending) {
      const f = pending.scan.fields;
      const total = pending.scan.totalAmount ?? f.baseAmount + f.itbis + f.isc + f.tip + f.otherTax;
      await this.whatsapp.sendText(
        msg.from,
        `Todavía tengo pendiente la factura ${f.ncf} (${DOP.format(total)}). Elige su destino, o escribe "cancelar" para descartarla, y después mándame la otra.`,
      );
      return;
    }
    this.processing.add(msg.from);
    try {
      await this.processFile(msg, user);
    } finally {
      this.processing.delete(msg.from);
    }
  }

  /** Lee el QR del e-CF si la foto lo trae (exacto, sin IA); si no se puede, se lee con IA. */
  private async scanFromQr(buffer: Buffer): Promise<ScanResult | null> {
    try {
      const text = await decodeQrFromImage(buffer);
      if (!text) return null;
      const scan = await this.invoices.fromQr(text);
      const f = scan.fields;
      // Un QR a medias (p. ej. la DGII no respondió y falta el nombre del emisor) no sirve: se usa la IA.
      return f.ncf && f.supplierRnc && f.supplierName && f.invoiceDate && f.baseAmount > 0 ? scan : null;
    } catch (err) {
      this.logger.log(`El QR de la foto no se pudo usar, se lee con IA: ${(err as Error).message}`);
      return null;
    }
  }

  private async processFile(msg: InboundMessage, user: User): Promise<void> {
    const mime = (msg.mime ?? '').toLowerCase();
    if (!msg.mediaId || !(SCAN_MIME_TYPES as readonly string[]).includes(mime)) {
      await this.whatsapp.sendText(msg.from, 'Solo puedo leer fotos (JPG, PNG, WEBP) o PDF de la factura.');
      return;
    }
    await this.whatsapp.sendText(msg.from, 'Recibida, leyendo la factura…');

    const media = await this.whatsapp.downloadMedia(msg.mediaId, SCAN_MAX_BYTES);
    if (!media) {
      await this.whatsapp.sendText(msg.from, 'No pude descargar el archivo (o pesa más de 8 MB). Intenta enviarlo otra vez.');
      return;
    }

    // Primero el QR del e-CF: es exacto, más rápido y no gasta IA. Sin QR (o papel B01…), se lee con IA.
    let scan: ScanResult | null = media.mime === 'application/pdf' ? null : await this.scanFromQr(media.buffer);
    if (!scan) {
      try {
        scan = await this.invoices.scan(media.buffer, media.mime);
      } catch (err) {
        this.logger.warn(`No se pudo leer una factura enviada por WhatsApp: ${(err as Error).message}`);
        await this.whatsapp.sendText(msg.from, 'No pude leer esa imagen. Envíala de nuevo, de frente y con buena luz.');
        return;
      }
    }

    const f = scan.fields;
    const missing: string[] = [];
    if (!f.ncf) missing.push('el NCF');
    if (!f.supplierRnc) missing.push('el RNC del emisor');
    if (!f.supplierName) missing.push('el nombre del emisor');
    if (!f.invoiceDate) missing.push('la fecha');
    if (!(f.baseAmount > 0)) missing.push('el monto');
    if (missing.length > 0) {
      await this.whatsapp.sendText(
        msg.from,
        `No parece una factura legible: no encontré ${missing.join(', ')}. Si sí lo es, regístrala desde Escanear en el ERP.`,
      );
      return;
    }
    if (scan.duplicate) {
      await this.whatsapp.sendText(
        msg.from,
        `Esa factura ya está registrada (${scan.duplicate.ncf} · ${scan.duplicate.supplierName}). No hice nada.`,
      );
      return;
    }

    this.sessions.set(msg.from, { userId: user.id, scan, buffer: media.buffer, mime: media.mime, expiresAt: Date.now() + SESSION_TTL_MS });
    await this.whatsapp.sendText(msg.from, this.summary(scan));
    await this.askDestinationType(msg.from);
  }

  private summary(scan: ScanResult): string {
    const f = scan.fields;
    const total = scan.totalAmount ?? f.baseAmount + f.itbis + f.isc + f.tip + f.otherTax;
    const tipo = f.expenseType ? EXPENSE_TYPES_606[f.expenseType] : null;
    const fromQr = scan.source === 'qr';
    const lines = [
      fromQr ? 'Leí el código QR de esta factura:' : 'Leí esta factura:',
      `• Emisor: ${f.supplierName} (RNC ${f.supplierRnc})`,
      `• NCF: ${f.ncf}`,
      `• Fecha: ${f.invoiceDate!.split('-').reverse().join('/')}`,
      `• Total: ${DOP.format(total)}${f.itbis > 0 ? ` (ITBIS ${DOP.format(f.itbis)})` : ''}`,
      `• Tipo de gasto: ${tipo ?? `${EXPENSE_TYPES_606[DEFAULT_EXPENSE_TYPE]} (no pude deducirlo, revísalo en el ERP)`}`,
    ];
    if (fromQr && scan.estadoDgii) lines.push(`• Estado en la DGII: ${scan.estadoDgii}`);
    if (fromQr) lines.push('ℹ️ El QR no trae el desglose de propina ni ISC: si la factura los lleva, ajústalo en el ERP.');
    if (scan.confidence === 'low') lines.push('⚠️ La lectura tiene poca confianza: revisa los datos antes de confirmar.');
    for (const w of scan.warnings.slice(0, 3)) lines.push(`⚠️ ${w}`);
    return lines.join('\n');
  }

  // ── Elegir el destino ───────────────────────────────────────────────────────

  /** Primer paso: ¿proyecto, gasto general o sin asignar? Así la lista de proyectos puede ocupar las 10 filas. */
  private async askDestinationType(to: string): Promise<void> {
    await this.whatsapp.sendButtons(
      to,
      '¿A dónde va esta factura? (Escribe "cancelar" para no registrarla.)',
      [
        { id: 'kind:project', title: 'Un proyecto' },
        { id: 'p:general', title: 'Gasto general' },
        { id: 'p:none', title: 'Sin asignar' },
      ],
    );
  }

  /**
   * Lista de proyectos, de 9 en 9 con "Ver más" (WhatsApp admite 10 filas por lista). Sin búsqueda
   * muestra los activos más recientes. Escribiendo una o varias palabras se busca entre todos los
   * proyectos que no están cancelados (completados, en pausa…), sin importar mayúsculas ni tildes,
   * en el nombre, el código o el nombre del cliente: "supermercado boca" o "cielos" bastan.
   */
  private async askProject(to: string, search?: string, page = 0): Promise<void> {
    const all = await this.projects.find({
      relations: { client: true },
      where: search ? { status: Not(ProjectStatus.CANCELLED) } : { status: ProjectStatus.ACTIVE },
      order: { updatedAt: 'DESC' },
    });
    const tokens = search ? foldName(search).split(' ').filter(Boolean) : [];
    const matching = tokens.length
      ? all.filter((p) => {
          const hay = foldName(`${p.code} ${p.name} ${p.client?.name ?? ''}`);
          return tokens.every((t) => hay.includes(t));
        })
      : all;

    const total = matching.length;
    if (total === 0) {
      await this.whatsapp.sendText(
        to,
        search
          ? `No encontré proyectos con "${search}". Escribe otra palabra del nombre, del código o del cliente.
(Escribe "cancelar" para salir.)`
          : `No hay proyectos activos. Escribe una palabra del nombre o del cliente para buscar entre todos.
(Escribe "cancelar" para salir.)`,
      );
      return;
    }

    const PAGE = total > 10 ? 9 : 10;
    const slice = matching.slice(page * 9, page * 9 + PAGE);
    const rows = slice.map((p) => ({
      id: `p:${p.id}`,
      title: p.code,
      description: `${p.status === ProjectStatus.ACTIVE ? '' : `[${STATUS_LABEL[p.status] ?? p.status}] `}${p.name}`,
    }));
    // 9 proyectos + "Ver más" = las 10 filas que admite una lista de WhatsApp.
    if (total > 10 && (page + 1) * 9 < total) {
      rows.push({ id: `more:${page + 1}`, title: 'Ver más proyectos', description: `Quedan ${total - (page + 1) * 9} por mostrar` });
    }

    const body = search
      ? `Proyectos que coinciden con "${search}" (${total}). ¿A cuál va?`
      : `Proyectos activos (${total}). Elige uno, o escribe una palabra del nombre o del cliente para buscar entre todos (también completados o en pausa).`;
    await this.whatsapp.sendList(to, `${body}
(Escribe "cancelar" para salir.)`, 'Elegir proyecto', rows);
  }

  private async onText(msg: InboundMessage, user: User, text: string): Promise<void> {
    const lower = text.toLowerCase();
    const session = this.sessions.get(msg.from);
    if (['cancelar', 'cancel', 'no'].includes(lower)) {
      this.sessions.delete(msg.from);
      await this.whatsapp.sendText(msg.from, session ? 'Cancelado, no registré nada.' : 'No hay nada pendiente.');
      return;
    }
    if (session && text.length >= 2 && text.length <= 60) {
      session.destination = undefined;
      session.search = text;
      await this.askProject(msg.from, text);
      return;
    }
    await this.whatsapp.sendText(
      msg.from,
      `Hola ${user.firstName}. Mándame la foto (o el PDF) de una factura y la registro: te muestro lo que leí y eliges a qué proyecto va.`,
    );
  }

  private async onChoice(msg: InboundMessage, user: User, id: string): Promise<void> {
    const session = this.sessions.get(msg.from);
    if (id === 'cancel') {
      this.sessions.delete(msg.from);
      await this.whatsapp.sendText(msg.from, 'Cancelado, no registré nada.');
      return;
    }
    if (!session || session.userId !== user.id) {
      await this.whatsapp.sendText(msg.from, 'Esa conversación ya expiró. Mándame la foto de la factura otra vez.');
      return;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;

    if (id === 'back') {
      session.destination = undefined;
      session.search = undefined;
      await this.askDestinationType(msg.from);
      return;
    }
    if (id === 'kind:project') {
      session.search = undefined;
      await this.askProject(msg.from);
      return;
    }
    if (id.startsWith('more:')) {
      await this.askProject(msg.from, session.search, Math.max(0, parseInt(id.slice(5), 10) || 0));
      return;
    }
    if (id === 'save') {
      await this.save(msg.from, user, session);
      return;
    }
    if (id.startsWith('p:')) {
      const dest = await this.resolveDestination(id.slice(2));
      if (!dest) {
        await this.whatsapp.sendText(msg.from, 'No encontré ese proyecto. Elige otro.');
        await this.askDestinationType(msg.from);
        return;
      }
      session.destination = dest;
      await this.whatsapp.sendButtons(
        msg.from,
        `Voy a registrar ${session.scan.fields.ncf} (${DOP.format(session.scan.totalAmount ?? 0)}) en: ${this.destinationLabel(dest)}.\n¿Confirmas?`,
        [
          { id: 'save', title: 'Guardar' },
          { id: 'back', title: 'Cambiar destino' },
          { id: 'cancel', title: 'Cancelar' },
        ],
      );
    }
  }

  private async resolveDestination(key: string): Promise<Destination | null> {
    if (key === 'general') return { kind: 'general' };
    if (key === 'none') return { kind: 'none' };
    const project = await this.projects.findOne({ where: { id: key } });
    return project ? { kind: 'project', id: project.id, label: `${project.code} — ${project.name}` } : null;
  }

  private destinationLabel(d: Destination): string {
    return d.kind === 'project' ? d.label : d.kind === 'general' ? 'Gasto general (sin proyecto)' : 'Sin asignar (solo 606)';
  }

  // ── Guardar ─────────────────────────────────────────────────────────────────

  private async save(to: string, user: User, session: Session): Promise<void> {
    const dest = session.destination;
    if (!dest) {
      await this.askDestinationType(to);
      return;
    }
    // Se borra antes de guardar: un doble toque en "Guardar" no puede registrar dos veces.
    this.sessions.delete(to);

    const f = session.scan.fields;
    const dto = {
      ncf: f.ncf,
      supplierRnc: f.supplierRnc,
      supplierName: f.supplierName,
      invoiceDate: f.invoiceDate!,
      baseAmount: f.baseAmount,
      itbis: f.itbis,
      isc: f.isc,
      tip: f.tip,
      otherTax: f.otherTax,
      paymentMethod: f.paymentMethod,
      expenseType: f.expenseType ?? DEFAULT_EXPENSE_TYPE,
      securityCode: f.securityCode ?? undefined,
      notes: f.notes ? `${f.notes} (registrada por WhatsApp)` : 'Registrada por WhatsApp',
      projectId: dest.kind === 'project' ? dest.id : dest.kind === 'general' ? null : undefined,
    } as CreateFiscalInvoiceDto;

    try {
      const saved = await this.invoices.create(dto, user.id);
      let photoNote = '';
      try {
        await this.attachPhoto(saved.id, session);
      } catch (err) {
        this.logger.error(`Factura ${saved.ncf} guardada, pero no su foto: ${(err as Error).message}`);
        photoNote = '\n(La foto no se pudo adjuntar; súbela desde el ERP.)';
      }
      if (saved.ncf.startsWith('E')) void this.invoices.validateWithDgii(saved.id, saved.securityCode ?? undefined).catch(() => undefined);
      await this.whatsapp.sendText(
        to,
        `✅ Registrada: ${saved.ncf} · ${saved.supplierName} · ${DOP.format(saved.totalAmount)}\nDestino: ${this.destinationLabel(dest)}${photoNote}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.warn(`No se pudo registrar la factura enviada por WhatsApp: ${message}`);
      await this.whatsapp.sendText(to, `No pude registrarla: ${message}`);
    }
  }

  /** Deja la imagen en la carpeta de facturas, igual que la subida desde el ERP, y la adjunta. */
  private async attachPhoto(invoiceId: string, session: Session): Promise<void> {
    const dir = join(getUploadRoot(), 'fiscal-invoices', todayRD().slice(0, 4));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${randomUUID()}${EXT[session.mime] ?? '.bin'}`);
    writeFileSync(path, session.buffer);
    await this.invoices.attachPhoto(invoiceId, {
      path,
      mimetype: session.mime,
      originalname: `whatsapp${EXT[session.mime] ?? ''}`,
      size: session.buffer.length,
    } as Express.Multer.File);
  }

  private dropExpired(): void {
    const now = Date.now();
    for (const [k, s] of this.sessions) if (s.expiresAt < now) this.sessions.delete(k);
  }
}
