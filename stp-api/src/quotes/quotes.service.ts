import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, statSync, existsSync, unlink } from 'fs';
import { Quote, QuoteStatus, IndirectCost, QuoteRevisionSummary } from './entities/quote.entity';
import { isRevisableStatus, revisionNumber } from './quote-revision';
import { QuoteItem } from './entities/quote-item.entity';
import { Client } from '../clients/entities/client.entity';
import { Project, ProjectStatus, ProjectType } from '../projects/entities/project.entity';
import { FileUpload, FileContext } from '../files/entities/file-upload.entity';
import { getUploadRoot } from '../files/files.utils';
import { generateQuotePdf } from './pdf.generator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { loadForUpdate } from '../common/load-for-update';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../users/entities/user.entity';
import { SettingsService } from '../settings/settings.service';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';
import {
  normalizeTree,
  directSubtotal,
  lineTotal,
  rowsToTree,
  flattenTree,
  countNodes,
  treeDepth,
  MAX_TREE_DEPTH,
  MAX_TREE_NODES,
  type QuoteNode,
  type QuoteNodeInput,
  type QuoteNodeAcu,
} from './quote-tree';
import { AcusService } from '../costs/acus.service';
import {
  applyMarkup,
  compareAcuLine,
  buildAcuDriftReport,
  ACU_COST_EPSILON,
  type AcuDriftLine,
  type AcuDriftReport,
} from './acu-pricing';

/** Convierte las filas ya guardadas de una cotización en el árbol de entrada (para clonar). */
function rowsToNodeInputs(rows: QuoteItem[]): QuoteNodeInput[] {
  const toInput = (node: {
    row: QuoteItem;
    children: { row: QuoteItem; children: unknown[] }[];
  }): QuoteNodeInput => ({
    kind: node.row.kind ?? 'item',
    description: node.row.description,
    quantity: node.row.quantity,
    unit: node.row.unit,
    unitPrice: node.row.unitPrice,
    discountPct: node.row.discountPct,
    // El congelado viaja tal cual a la revisión: una revisión hereda el precio que se
    // cotizó, no el costo de hoy. Perderlo dejaría la revisión sin nada contra lo que
    // avisar y el aviso de desfase se apagaría justo cuando más hace falta.
    acu: rowToFreeze(node.row),
    children: node.children.map((c) =>
      toInput(c as { row: QuoteItem; children: { row: QuoteItem; children: unknown[] }[] }),
    ),
  });
  return rowsToTree(rows).map((n) => toInput(n));
}

/** Congelado guardado en una fila, en la forma que viaja por el árbol. */
function rowToFreeze(row: QuoteItem): QuoteNodeAcu | null {
  if (!row.acuId) return null;
  return {
    acuId: row.acuId,
    acuUnitCost: row.acuUnitCost ?? 0,
    acuMarkupPct: row.acuMarkupPct ?? 0,
    acuPricedAt: row.acuPricedAt ?? row.createdAt ?? new Date(),
    acuIncomplete: row.acuIncomplete ?? false,
  };
}

/**
 * Columnas del congelado tal como se guardan. Cuando el nodo no viene de un ACU se
 * escriben todas a null EXPLÍCITAMENTE: al reemplazar el árbol de una cotización, dejar
 * el campo fuera haría que una línea heredara el enlace de la que ocupaba su sitio.
 */
function acuColumns(acu: QuoteNodeAcu | null): Partial<QuoteItem> {
  if (!acu) {
    return {
      acuId: null,
      acuUnitCost: null,
      acuMarkupPct: null,
      acuPricedAt: null,
      acuIncomplete: false,
    } as unknown as Partial<QuoteItem>;
  }
  return {
    acuId: acu.acuId,
    acuUnitCost: acu.acuUnitCost,
    acuMarkupPct: acu.acuMarkupPct,
    acuPricedAt: acu.acuPricedAt,
    acuIncomplete: acu.acuIncomplete,
  };
}

/** Un nodo del árbol de entrada tal como puede llegar del cliente (DTO plano). */
type QuoteNodeWithAcu = QuoteNodeInput & {
  acuId?: string;
  acuMarkupPct?: number;
  acuUnitCost?: number;
  acuPricedAt?: string | Date;
  acuIncomplete?: boolean;
  allowIncompleteAcu?: boolean;
};

/** Motivo por el que una línea no se pudo (o no se debió) re-congelar. */
export interface AcuRefreshSkip {
  itemId: string;
  description: string;
  reason: 'acu-not-found' | 'no-cost' | 'incomplete' | 'manual-override';
  detail: string;
}

export interface AcuRefreshResult {
  updated: {
    itemId: string;
    description: string;
    previousUnitCost: number | null;
    unitCost: number;
    previousUnitPrice: number;
    unitPrice: number;
  }[];
  skipped: AcuRefreshSkip[];
  quote: Quote;
}

export type QuoteDecisionResult =
  | { kind: 'success'; status: QuoteStatus.APPROVED | QuoteStatus.REJECTED; quoteNumber: string }
  | { kind: 'already'; status: QuoteStatus.APPROVED | QuoteStatus.REJECTED; quoteNumber: string }
  | { kind: 'not-sent'; quoteNumber: string }
  | { kind: 'invalid' };

@Injectable()
export class QuotesService implements OnModuleInit {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    @InjectRepository(Quote)
    private readonly quotesRepository: Repository<Quote>,
    @InjectRepository(QuoteItem)
    private readonly itemsRepository: Repository<QuoteItem>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(FileUpload)
    private readonly fileRepo: Repository<FileUpload>,
    private readonly notifications: NotificationsService,
    private readonly settingsService: SettingsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly access: AccessControlService,
    private readonly acus: AcusService,
  ) {}

  onModuleInit() {
    void this.expireOverdueQuotes().catch((err: Error) =>
      this.logger.error(`Initial expiry check failed: ${err.message}`),
    );
    setInterval(
      () =>
        void this.expireOverdueQuotes().catch((err: Error) =>
          this.logger.error(`Scheduled expiry check failed: ${err.message}`),
        ),
      24 * 60 * 60 * 1000,
    );
  }

  /**
   * Ejecuta una notificación fire-and-forget de forma segura: un throw síncrono
   * (I/O de PDF, toLocaleString sobre valor nulo, etc.) NUNCA debe romper la
   * operación principal (create/update de la cotización).
   */
  private notifySafe(action: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.logger.error(`Notification (${action}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Genera un JWT firmado de decisión (aprobar/rechazar) para el cliente y
   * construye las URLs públicas de los botones del correo.
   * - Expiración: hasta el `validUntil` de la cotización (fin de ese día) si
   *   existe y es futuro; en caso contrario, 30 días.
   */
  private buildDecisionUrls(quote: Quote): { approveUrl: string; rejectUrl: string } {
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    let expiresIn = THIRTY_DAYS;
    if (quote.validUntil) {
      // validUntil es una fecha (YYYY-MM-DD); damos margen hasta el fin de ese día.
      const endOfDay = new Date(quote.validUntil).getTime() + 24 * 60 * 60 * 1000;
      const seconds = Math.floor((endOfDay - Date.now()) / 1000);
      expiresIn = seconds > 0 ? seconds : THIRTY_DAYS;
    }

    const token = this.jwtService.sign(
      { sub: quote.id, type: 'quote-decision' },
      { expiresIn },
    );

    const base =
      this.config.get<string>('QUOTE_DECISION_BASE_URL') ?? 'https://stpsoluciones.com/erp-api';
    const enc = encodeURIComponent(token);
    return {
      approveUrl: `${base}/quotes/decision?token=${enc}&action=approve`,
      rejectUrl: `${base}/quotes/decision?token=${enc}&action=reject`,
    };
  }

  /**
   * Procesa la decisión del cliente (aprobar/rechazar) desde el enlace del correo.
   * Público e idempotente. Devuelve un resultado tipado que el controlador
   * traduce a HTML con branding STP.
   */
  async decide(
    token: string,
    action: string,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<QuoteDecisionResult> {
    if (action !== 'approve' && action !== 'reject') {
      return { kind: 'invalid' };
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify<{ sub?: string; type?: string }>(token);
    } catch {
      return { kind: 'invalid' };
    }
    if (payload.type !== 'quote-decision' || !payload.sub) {
      return { kind: 'invalid' };
    }

    const quote = await this.quotesRepository.findOne({
      where: { id: payload.sub },
      relations: { client: true },
    });
    if (!quote) return { kind: 'invalid' };

    // Ya decidida previamente → idempotente, no cambia nada.
    if (quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.REJECTED) {
      return { kind: 'already', status: quote.status, quoteNumber: quote.number };
    }

    // Reemplazada por una revisión posterior: el enlace del correo viejo ya no
    // decide sobre este documento histórico.
    if (quote.supersededById) {
      return { kind: 'not-sent', quoteNumber: quote.number };
    }

    // Solo se puede decidir sobre cotizaciones enviadas.
    if (quote.status !== QuoteStatus.SENT) {
      return { kind: 'not-sent', quoteNumber: quote.number };
    }

    const newStatus = action === 'approve' ? QuoteStatus.APPROVED : QuoteStatus.REJECTED;
    quote.status = newStatus;
    quote.decidedAt = new Date();
    if (meta?.ip) quote.decisionIp = meta.ip.slice(0, 64);
    if (meta?.userAgent) quote.decisionUserAgent = meta.userAgent.slice(0, 512);
    await this.quotesRepository.save(quote);

    if (newStatus === QuoteStatus.APPROVED) {
      this.notifySafe('quote-approved', () =>
        this.notifications.sendQuoteApproved({
          quoteNumber: quote.number,
          quoteTitle: quote.title,
          clientName: quote.client?.name ?? 'Cliente',
          total: quote.total,
        }),
      );
    } else {
      this.notifySafe('quote-rejected', () =>
        this.notifications.sendQuoteRejected({
          clientName: quote.client?.name ?? 'Cliente',
          quoteNumber: quote.number,
          quoteTitle: quote.title,
        }),
      );
    }

    return { kind: 'success', status: newStatus, quoteNumber: quote.number };
  }

  private async expireOverdueQuotes(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    const toExpire = await this.quotesRepository
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.client', 'client')
      .where('q.status IN (:...statuses)', { statuses: [QuoteStatus.DRAFT, QuoteStatus.SENT] })
      .andWhere('q.validUntil IS NOT NULL')
      .andWhere('q.validUntil < :today', { today })
      .getMany();

    if (!toExpire.length) return;

    await this.quotesRepository
      .createQueryBuilder()
      .update(Quote)
      .set({ status: QuoteStatus.EXPIRED })
      .whereInIds(toExpire.map((q) => q.id))
      .execute();

    for (const quote of toExpire) {
      if (quote.client?.email) {
        this.notifySafe('quote-expired', () =>
          this.notifications.sendQuoteExpired({
            clientEmail: quote.client.email,
            clientName: quote.client.name,
            quoteNumber: quote.number,
            quoteTitle: quote.title,
            validUntil: quote.validUntil,
          }),
        );
      }
    }
  }

  /**
   * Recordatorio automático al cliente de cotizaciones SENT sin respuesta.
   * Reglas: 3+ días desde el envío (o el último recordatorio), máximo 2
   * recordatorios por envío, y solo si la cotización sigue vigente.
   * Lo invoca el SchedulerService a diario.
   */
  async remindPendingQuotes(): Promise<number> {
    const REMIND_AFTER_DAYS = 3;
    const MAX_REMINDERS = 2;
    const cutoff = new Date(Date.now() - REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const today = new Date().toISOString().slice(0, 10);

    const pending = await this.quotesRepository
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.client', 'client')
      .where('q.status = :sent', { sent: QuoteStatus.SENT })
      .andWhere('q.sentAt IS NOT NULL')
      .andWhere('q.sentAt <= :cutoff', { cutoff })
      .andWhere('q.reminderCount < :max', { max: MAX_REMINDERS })
      .andWhere('(q.lastReminderAt IS NULL OR q.lastReminderAt <= :cutoff)', { cutoff })
      .andWhere('(q.validUntil IS NULL OR q.validUntil >= :today)', { today })
      .getMany();

    let sent = 0;
    for (const quote of pending) {
      if (!quote.client?.email) continue;
      const { approveUrl, rejectUrl } = this.buildDecisionUrls(quote);
      this.notifySafe('quote-reminder', () =>
        this.notifications.sendQuoteReminder({
          clientEmail: quote.client.email,
          clientName: quote.client.name,
          quoteNumber: quote.number,
          quoteTitle: quote.title,
          total: quote.total,
          validUntil: quote.validUntil,
          approveUrl,
          rejectUrl,
        }),
      );
      await this.quotesRepository.update(quote.id, {
        reminderCount: quote.reminderCount + 1,
        lastReminderAt: new Date(),
      });
      sent++;
    }

    if (sent) this.logger.log(`Sent ${sent} quote reminder(s) to clients`);
    return sent;
  }

  async create(dto: CreateQuoteDto, createdById: string): Promise<Quote> {
    await this.assertClientExists(dto.clientId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId);

    const number = await this.generateNumber();
    const { items: itemDtos, ...quoteData } = dto;

    const quote = this.quotesRepository.create({
      ...quoteData,
      number,
      baseNumber: number,
      revision: 1,
      createdById,
    });
    if (dto.status === QuoteStatus.SENT) quote.sentAt = new Date();
    const saved = await this.quotesRepository.save(quote);

    if (itemDtos?.length) {
      await this.persistTree(saved.id, itemDtos);
      await this.recalculate(saved.id);
    } else if (dto.indirectCosts) {
      await this.recalculate(saved.id);
    }

    const result = await this.findOne(saved.id);

    await this.savePdfForQuote(result).catch((err: Error) =>
      this.logger.error(`PDF generation failed for quote ${result.id}: ${err.message}`),
    );

    if (dto.status === QuoteStatus.SENT && result.client?.email) {
      const pdfFile = await this.findPdfFile(result.id);
      const pdfPath = pdfFile ? join(getUploadRoot(), pdfFile.path) : undefined;
      const { approveUrl, rejectUrl } = this.buildDecisionUrls(result);
      this.notifySafe('quote-sent', () =>
        this.notifications.sendQuoteSent({
          clientEmail: result.client.email,
          clientName: result.client.name,
          quoteNumber: result.number,
          quoteTitle: result.title,
          total: result.total,
          validUntil: result.validUntil,
          pdfPath,
          approveUrl,
          rejectUrl,
        }),
      );
    }

    return result;
  }

  async findAll(query: QueryQuotesDto, user?: AccessSubject) {
    const { search, status, clientId, projectId, page = 1, limit = 20 } = query;

    const qb = this.quotesRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.client', 'client')
      .leftJoinAndSelect('quote.project', 'project')
      .leftJoinAndSelect('quote.items', 'items')
      .orderBy('quote.createdAt', 'DESC')
      .addOrderBy('items.sortOrder', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('(quote.number ILIKE :q OR quote.title ILIKE :q)', { q: `%${search}%` });
    }
    if (status) qb.andWhere('quote.status = :status', { status });
    if (clientId) qb.andWhere('quote.clientId = :clientId', { clientId });
    if (projectId) qb.andWhere('quote.projectId = :projectId', { projectId });

    // Por defecto el listado muestra solo la revisión VIGENTE de cada familia
    // (las reemplazadas quedan como historial, accesibles desde el detalle).
    if (!query.includeSuperseded) {
      qb.andWhere('quote.supersededById IS NULL');
    }

    await this.access.applyScope(qb, user, {
      projectExpr: 'quote.projectId',
      clientExpr: 'quote.clientId',
    });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.quotesRepository.findOne({
      where: { id },
      // `items.acu` para poder decir de QUÉ partida de costos sale un unitario sin pedir
      // cada ACU por separado. Es la relación de la línea, no su costo: el costo de hoy
      // se calcula aparte (`acuDrift`), porque el guardado aquí es el congelado.
      relations: { client: true, project: true, createdBy: true, items: { acu: true } },
      order: { items: { sortOrder: 'ASC' } },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    quote.revisions = await this.getRevisionHistory(quote.baseNumber);
    return quote;
  }

  /** Historial de la familia (todas las revisiones que comparten baseNumber). */
  private async getRevisionHistory(baseNumber: string): Promise<QuoteRevisionSummary[]> {
    const rows = await this.quotesRepository.find({
      where: { baseNumber },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        total: true,
        createdAt: true,
        supersededById: true,
      },
      order: { revision: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      revision: r.revision,
      status: r.status,
      total: r.total,
      createdAt: r.createdAt,
      supersededById: r.supersededById ?? null,
    }));
  }

  async update(id: string, dto: UpdateQuoteDto, userRole?: UserRole): Promise<Quote> {
    const quote = await this.findOne(id);
    this.assertEditable(quote, userRole);

    const previousStatus = quote.status;

    if (dto.clientId && dto.clientId !== quote.clientId) {
      await this.assertClientExists(dto.clientId);
    }
    if (dto.projectId && dto.projectId !== quote.projectId) {
      await this.assertProjectExists(dto.projectId);
    }

    const { items: itemsDto, ...headerDto } = dto;
    const defined = Object.fromEntries(
      Object.entries(headerDto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    // Sin relaciones: el objeto `client`/`project` cargado pisaría la columna FK
    // y el cambio de cliente o proyecto no se guardaría (ver loadForUpdate).
    const target = await loadForUpdate(this.quotesRepository, id, 'Quote not found');
    Object.assign(target, defined);
    if (dto.status === QuoteStatus.SENT && previousStatus !== QuoteStatus.SENT) {
      target.sentAt = new Date();
      target.reminderCount = 0;
    }
    await this.quotesRepository.save(target);

    if (itemsDto !== undefined) {
      // Se reemplaza el árbol entero. El borrado va de hojas a raíz para no
      // depender del CASCADE mientras se reconstruye.
      await this.itemsRepository.delete({ quoteId: id });
      if (itemsDto.length > 0) await this.persistTree(id, itemsDto);
      await this.recalculate(id);
    } else if (
      dto.taxRate !== undefined ||
      dto.discount !== undefined ||
      dto.indirectCosts !== undefined
    ) {
      await this.recalculate(id);
    }

    const updated = await this.findOne(id);

    await this.savePdfForQuote(updated).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for quote ${id}: ${err.message}`),
    );

    if (dto.status && dto.status !== previousStatus) {
      if (dto.status === QuoteStatus.SENT && updated.client?.email) {
        const pdfFile = await this.findPdfFile(id);
        const pdfPath = pdfFile ? join(getUploadRoot(), pdfFile.path) : undefined;
        const { approveUrl, rejectUrl } = this.buildDecisionUrls(updated);
        this.notifySafe('quote-sent', () =>
          this.notifications.sendQuoteSent({
            clientEmail: updated.client.email,
            clientName: updated.client.name,
            quoteNumber: updated.number,
            quoteTitle: updated.title,
            total: updated.total,
            validUntil: updated.validUntil,
            pdfPath,
            approveUrl,
            rejectUrl,
          }),
        );
      }
      if (dto.status === QuoteStatus.APPROVED) {
        this.notifySafe('quote-approved', () =>
          this.notifications.sendQuoteApproved({
            quoteNumber: updated.number,
            quoteTitle: updated.title,
            clientName: updated.client?.name ?? 'Cliente',
            total: updated.total,
          }),
        );
      }
      if (dto.status === QuoteStatus.REJECTED) {
        this.notifySafe('quote-rejected', () =>
          this.notifications.sendQuoteRejected({
            clientName: updated.client?.name ?? 'Cliente',
            quoteNumber: updated.number,
            quoteTitle: updated.title,
          }),
        );
      }
    }

    return updated;
  }

  async sendEmail(id: string): Promise<void> {
    const quote = await this.findOne(id);
    this.assertNotSuperseded(quote);
    if (!quote.client?.email) {
      throw new BadRequestException('El cliente no tiene email registrado');
    }

    if (quote.status === QuoteStatus.DRAFT) {
      quote.status = QuoteStatus.SENT;
      quote.sentAt = new Date();
      quote.reminderCount = 0;
      await this.quotesRepository.save(quote);
    }

    const pdfFile = await this.findPdfFile(id);
    const pdfPath = pdfFile ? join(getUploadRoot(), pdfFile.path) : undefined;
    const { approveUrl, rejectUrl } = this.buildDecisionUrls(quote);

    this.notifySafe('quote-sent', () =>
      this.notifications.sendQuoteSent({
        clientEmail: quote.client.email,
        clientName: quote.client.name,
        quoteNumber: quote.number,
        quoteTitle: quote.title,
        total: quote.total,
        validUntil: quote.validUntil,
        pdfPath,
        approveUrl,
        rejectUrl,
      }),
    );
  }

  async remove(id: string): Promise<void> {
    const quote = await this.findOne(id);
    const pdfFilename = `${quote.number}.pdf`;
    await this.quotesRepository.remove(quote);
    // El PDF se limpia DESPUÉS y sin propagar, igual que en gastos: el dato es la
    // cotización, y un fallo de disco no puede devolver un error por algo accesorio.
    // El nombre se lee antes del borrado porque después la entidad ya no sirve.
    await this.removePdfByFilename(pdfFilename, `la cotización ${quote.number}`);
  }

  async convertToProject(id: string, createdById: string): Promise<Project> {
    const quote = await this.findOne(id);
    this.assertNotSuperseded(quote);

    if (quote.status !== QuoteStatus.APPROVED) {
      throw new BadRequestException('Solo se pueden convertir cotizaciones aprobadas');
    }
    if (quote.projectId) {
      throw new BadRequestException('Esta cotización ya está vinculada a un proyecto');
    }

    const year = new Date().getFullYear();
    const row = await this.projectsRepository
      .createQueryBuilder('p')
      .select(`MAX(CAST(SPLIT_PART(p.code, '-', 3) AS INTEGER))`, 'max')
      .where('p.code LIKE :pattern', { pattern: `PRJ-${year}-%` })
      .getRawOne<{ max: string | null }>();
    const next = (parseInt(row?.max ?? '0') || 0) + 1;
    const code = `PRJ-${year}-${String(next).padStart(3, '0')}`;

    const project = this.projectsRepository.create({
      code,
      name: quote.title,
      clientId: quote.clientId,
      budget: quote.total,
      description: `Generado desde cotización ${quote.number}`,
      status: ProjectStatus.DRAFT,
      type: ProjectType.OTHER,
      createdById,
    });
    const saved = await this.projectsRepository.save(project);

    quote.projectId = saved.id;
    await this.quotesRepository.save(quote);

    return saved;
  }

  /**
   * Emite una REVISIÓN (rev.N+1) de una cotización sin perder la original.
   * - Solo se puede revisar la cotización VIGENTE de la familia (no una ya
   *   reemplazada) y solo desde un estado revisable (sent/approved/rejected/
   *   expired). Una DRAFT se edita directamente.
   * - Clona items, gastos indirectos, términos, descuento, taxRate, validUntil,
   *   cliente y proyecto a un nuevo Quote en estado DRAFT, con el seguimiento
   *   comercial REINICIADO (sentAt/decidedAt/recordatorios en cero).
   * - Marca la original como reemplazada (`supersededById` → nueva revisión).
   */
  async revise(id: string, createdById: string): Promise<Quote> {
    const origin = await this.findOne(id);

    if (origin.supersededById) {
      throw new UnprocessableEntityException(
        'Esta cotización ya fue reemplazada por una revisión posterior; revisa la versión vigente.',
      );
    }
    if (!isRevisableStatus(origin.status)) {
      throw new UnprocessableEntityException(
        'Solo se puede revisar una cotización enviada, aprobada, rechazada o expirada. Una cotización en borrador se edita directamente.',
      );
    }

    const nextRevision = origin.revision + 1;
    const number = revisionNumber(origin.baseNumber, nextRevision);

    // Clon profundo de los gastos indirectos (el backend recalcula amounts).
    const indirectCosts = Array.isArray(origin.indirectCosts)
      ? origin.indirectCosts.map((c) => ({ ...c }))
      : origin.indirectCosts;

    const revision = this.quotesRepository.create({
      number,
      baseNumber: origin.baseNumber,
      revision: nextRevision,
      title: origin.title,
      status: QuoteStatus.DRAFT,
      clientId: origin.clientId,
      projectId: origin.projectId ?? undefined,
      createdById,
      validUntil: origin.validUntil,
      taxRate: origin.taxRate,
      discount: origin.discount,
      indirectCosts,
      notes: origin.notes,
      terms: origin.terms,
      // Seguimiento comercial reiniciado: sentAt/decidedAt/reminderCount, etc.
      // quedan en sus defaults (null/0) — la revisión aún no se ha enviado.
    });
    const saved = await this.quotesRepository.save(revision);

    // Clonar el árbol conservando la jerarquía: se reconstruye desde las filas
    // de la original y se vuelve a persistir como árbol nuevo (ids nuevos).
    if (origin.items?.length) {
      await this.persistTree(saved.id, rowsToNodeInputs(origin.items));
    }
    await this.recalculate(saved.id);

    // La original queda como documento histórico reemplazado.
    origin.supersededById = saved.id;
    await this.quotesRepository.save(origin);

    const result = await this.findOne(saved.id);

    await this.savePdfForQuote(result).catch((err: Error) =>
      this.logger.error(`PDF generation failed for revision ${result.id}: ${err.message}`),
    );

    return result;
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  async addItem(quoteId: string, dto: CreateQuoteItemDto, userRole?: UserRole): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote, userRole);

    const { parentId, children, ...node } = dto;
    if (parentId) {
      const parent = await this.itemsRepository.findOne({
        where: { id: parentId, quoteId },
      });
      if (!parent) throw new BadRequestException('La partida padre no existe');
    }

    // Se añade al final de sus hermanos, respetando el árbol.
    const siblings = await this.itemsRepository.countBy({
      quoteId,
      parentId: parentId ?? IsNull(),
    });
    // Con `acuId` el unitario lo pone el ACU: se congela aquí, antes de normalizar.
    const resuelto = await this.resolveAcuNodes([{ ...node, children } as QuoteNodeInput]);
    const [normalized] = normalizeTree(resuelto);
    this.assertTreeLimits([normalized]);

    const created = await this.itemsRepository.save(
      this.itemsRepository.create({
        quoteId,
        parentId: parentId ?? undefined,
        kind: normalized.kind,
        description: normalized.description,
        unit: normalized.unit ?? undefined,
        quantity: normalized.quantity,
        unitPrice: normalized.unitPrice,
        discountPct: normalized.discountPct,
        total: normalized.total,
        sortOrder: siblings,
        ...acuColumns(normalized.acu),
      }),
    );
    if (normalized.children.length > 0) {
      await this.persistChildren(quoteId, created.id, normalized.children);
    }
    await this.recalculate(quoteId);
    const result = await this.findOne(quoteId);
    await this.savePdfForQuote(result).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for quote ${quoteId}: ${err.message}`),
    );
    return result;
  }

  async updateItem(quoteId: string, itemId: string, dto: UpdateQuoteItemDto, userRole?: UserRole): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote, userRole);

    const item = await this.itemsRepository.findOne({ where: { id: itemId, quoteId } });
    if (!item) throw new NotFoundException('Item not found');

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(item, defined);
    // El total de un grupo lo fija recalculate() sumando sus hijos; el de una
    // línea sale de su propia cantidad y precio.
    if (item.kind !== 'group') item.total = lineTotal(item);
    await this.itemsRepository.save(item);
    await this.recalculate(quoteId);
    const result = await this.findOne(quoteId);
    await this.savePdfForQuote(result).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for quote ${quoteId}: ${err.message}`),
    );
    return result;
  }

  async removeItem(quoteId: string, itemId: string, userRole?: UserRole): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote, userRole);

    const item = await this.itemsRepository.findOne({ where: { id: itemId, quoteId } });
    if (!item) throw new NotFoundException('Item not found');

    await this.itemsRepository.remove(item);
    await this.recalculate(quoteId);
    const result = await this.findOne(quoteId);
    await this.savePdfForQuote(result).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for quote ${quoteId}: ${err.message}`),
    );
    return result;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private round2(n: number): number {
    return parseFloat(n.toFixed(2));
  }

  /**
   * Recalcula los amounts de los gastos indirectos server-side y devuelve
   * { costs, taxAmount, total }. Los amounts recibidos del cliente se ignoran.
   */
  private computeIndirectCosts(base: number, costs: IndirectCost[]): {
    costs: IndirectCost[];
    taxAmount: number;
    total: number;
  } {
    let taxBase = 0;
    // 1ª pasada: gastos normales (porcentaje del base). Acumula la base del ITBIS.
    const computed: IndirectCost[] = costs
      .filter((c) => c.kind !== 'itbis')
      .map((c) => {
        const amount = this.round2(base * (Number(c.pct) || 0) / 100);
        if (c.taxable) taxBase += amount;
        return { name: c.name, pct: Number(c.pct) || 0, amount, taxable: c.taxable || undefined };
      });

    // 2ª pasada: entradas ITBIS (porcentaje sobre la base gravada, p.ej. Dirección Técnica).
    let taxAmount = 0;
    for (const c of costs.filter((c) => c.kind === 'itbis')) {
      const amount = this.round2(taxBase * (Number(c.pct) || 0) / 100);
      taxAmount += amount;
      computed.push({ name: c.name, pct: Number(c.pct) || 0, amount, kind: 'itbis' });
    }

    const sumCosts = computed.reduce((s, c) => s + c.amount, 0);
    const total = this.round2(base + sumCosts);
    return { costs: computed, taxAmount: this.round2(taxAmount), total };
  }

  // ── Árbol de partidas ─────────────────────────────────────────────────────

  /**
   * Guarda un árbol de partidas completo. Se insertan los padres antes que los
   * hijos porque el `parentId` necesita el id ya generado.
   *
   * Los totales salen SIEMPRE de `normalizeTree`: el de una línea es
   * cantidad × unitario − descuento y el de un grupo es la suma de sus
   * descendientes, así que un cliente no puede mandar un total que no cuadre.
   */
  private async persistTree(
    quoteId: string,
    input: QuoteNodeInput[],
  ): Promise<void> {
    const resuelto = await this.resolveAcuNodes(input);
    const tree = normalizeTree(resuelto);
    this.assertTreeLimits(tree);

    await this.persistChildren(quoteId, null, tree);
  }

  // ── Puente con el módulo de Costos (ACU) ──────────────────────────────────

  /**
   * Resuelve las líneas que vienen de una partida de costos ANTES de normalizar el
   * árbol, porque `normalizeTree` ya necesita el unitario puesto.
   *
   * Dos caminos, y la diferencia importa:
   * - **Congelar** (llega `acuId` sin `acuUnitCost`): se valora la receta con los
   *   precios vigentes de hoy y el resultado queda guardado en la línea.
   * - **Conservar** (llega también `acuUnitCost`): es el mismo congelado volviendo de
   *   una edición o de una revisión. NO se revalora. Una cotización que ya salió no
   *   puede cambiar de precio porque alguien le corrigiera una coma al título.
   */
  private async resolveAcuNodes(input: QuoteNodeInput[]): Promise<QuoteNodeInput[]> {
    const conAcu: QuoteNodeWithAcu[] = [];
    const recolectar = (nodes: QuoteNodeInput[]): void => {
      for (const node of nodes) {
        const n = node as QuoteNodeWithAcu;
        if (n.acuId ?? n.acu?.acuId) conAcu.push(n);
        if (node.children?.length) recolectar(node.children);
      }
    };
    recolectar(input);
    if (conAcu.length === 0) return input;

    const ids = conAcu.map((n) => (n.acuId ?? n.acu?.acuId) as string);
    const costos = await this.acus.costsByIds(ids);

    const mapear = (nodes: QuoteNodeInput[]): QuoteNodeInput[] =>
      nodes.map((node) => {
        const n = node as QuoteNodeWithAcu;
        const acuId = n.acuId ?? n.acu?.acuId;
        const children = node.children?.length ? mapear(node.children) : node.children;
        if (!acuId) return { ...node, children };

        const entrada = costos.get(acuId);
        if (!entrada) {
          throw new BadRequestException(`La partida de costos ${acuId} no existe`);
        }

        const markup = n.acuMarkupPct ?? n.acu?.acuMarkupPct ?? 0;
        const congeladoPrevio = n.acuUnitCost ?? n.acu?.acuUnitCost;

        if (congeladoPrevio != null) {
          const pricedAt = n.acuPricedAt ?? n.acu?.acuPricedAt;
          return {
            ...node,
            children,
            acu: {
              acuId,
              acuUnitCost: congeladoPrevio,
              acuMarkupPct: markup,
              acuPricedAt: pricedAt ? new Date(pricedAt) : new Date(),
              acuIncomplete: (n.acuIncomplete ?? n.acu?.acuIncomplete) === true,
            },
          };
        }

        const { cost, acu } = entrada;
        if (!(cost.directCost > 0)) {
          throw new UnprocessableEntityException(
            `La partida "${acu.name}" no tiene un costo valorable (su receta está vacía o vale 0). ` +
              'Complétala antes de cotizarla.',
          );
        }
        if (cost.incomplete && n.allowIncompleteAcu !== true) {
          // Un ACU incompleto NO se congela como bueno. El total es un piso: faltan
          // precios, así que cotizarlo sería mandarle al cliente un número que ya se
          // sabe corto. Se puede forzar, pero a conciencia y dejando marca.
          throw new UnprocessableEntityException({
            statusCode: 422,
            error: 'ACU_INCOMPLETE',
            message:
              `La partida "${acu.name}" tiene ${cost.missingMaterialIds.length} material(es) sin ` +
              'precio vigente: su costo es un piso, no el costo real. Registra los precios que ' +
              'faltan o confirma que quieres congelarlo así (`allowIncompleteAcu`).',
            acuId,
            missingMaterialIds: cost.missingMaterialIds,
          });
        }

        return {
          ...node,
          children,
          // Un unitario explícito gana: sirve para cotizar por encima (o por debajo) del
          // costo sin perder de dónde salió el número.
          unitPrice: node.unitPrice ?? applyMarkup(cost.directCost, markup),
          acu: {
            acuId,
            acuUnitCost: cost.directCost,
            acuMarkupPct: markup,
            acuPricedAt: new Date(),
            acuIncomplete: cost.incomplete,
          },
        };
      });

    return mapear(input);
  }

  /**
   * Aviso de precios viejos: qué líneas de la cotización nacieron de un ACU y cuánto se
   * ha desfasado su unitario congelado respecto al costo de HOY.
   *
   * Es de solo lectura a propósito. Actualizar es `POST /quotes/:id/acu-refresh`, una
   * decisión humana: el precio que vio el cliente no se toca solo.
   */
  async acuDrift(quoteId: string): Promise<AcuDriftReport> {
    const quote = await this.findOne(quoteId);
    const rows = (quote.items ?? []).filter((i) => i.acuId && i.kind !== 'group');
    if (rows.length === 0) return buildAcuDriftReport([]);

    const costos = await this.acus.costsByIds(rows.map((r) => r.acuId));
    const etiquetas = new Map(
      flattenTree(rowsToTree(quote.items ?? [])).map((n) => [n.row.id, n.label]),
    );

    const lines: AcuDriftLine[] = rows.map((row) => {
      const entrada = costos.get(row.acuId);
      const linea = compareAcuLine(
        {
          id: row.id,
          description: row.description,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          discountPct: row.discountPct,
          acuId: row.acuId,
          acuUnitCost: row.acuUnitCost,
          acuMarkupPct: row.acuMarkupPct,
          acuPricedAt: row.acuPricedAt,
          acuIncomplete: row.acuIncomplete,
        },
        entrada ? { directCost: entrada.cost.directCost, incomplete: entrada.cost.incomplete } : null,
      );
      return {
        ...linea,
        label: etiquetas.get(row.id),
        acuCode: entrada?.acu.code,
        acuName: entrada?.acu.name,
      };
    });

    return buildAcuDriftReport(lines);
  }

  /**
   * Vuelve a congelar el unitario de las líneas que vienen de un ACU con los costos de
   * hoy, conservando el margen de cada una.
   *
   * Se salta —sin romper la operación— lo que no se debe pisar por las bravas: ACU
   * incompletos y unitarios escritos a mano después de congelar. Cada omisión sale
   * listada con su motivo, para que quien lo pidió sepa qué quedó sin tocar.
   */
  async refreshAcuPrices(
    quoteId: string,
    dto: { itemIds?: string[]; allowIncomplete?: boolean; overrideManual?: boolean } = {},
    userRole?: UserRole,
  ): Promise<AcuRefreshResult> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote, userRole);

    const pedidos = dto.itemIds?.length ? new Set(dto.itemIds) : null;
    const rows = (quote.items ?? []).filter(
      (i) => i.acuId && i.kind !== 'group' && (!pedidos || pedidos.has(i.id)),
    );
    if (rows.length === 0) {
      return { updated: [], skipped: [], quote };
    }

    const costos = await this.acus.costsByIds(rows.map((r) => r.acuId));
    const ahora = new Date();
    const updated: AcuRefreshResult['updated'] = [];
    const skipped: AcuRefreshSkip[] = [];
    const dirty: QuoteItem[] = [];

    for (const row of rows) {
      const entrada = costos.get(row.acuId);
      if (!entrada) {
        skipped.push({
          itemId: row.id,
          description: row.description,
          reason: 'acu-not-found',
          detail: 'La partida de costos enlazada ya no existe.',
        });
        continue;
      }
      const { cost, acu } = entrada;
      if (!(cost.directCost > 0)) {
        skipped.push({
          itemId: row.id,
          description: row.description,
          reason: 'no-cost',
          detail: `La partida "${acu.name}" no tiene hoy un costo valorable.`,
        });
        continue;
      }
      if (cost.incomplete && dto.allowIncomplete !== true) {
        skipped.push({
          itemId: row.id,
          description: row.description,
          reason: 'incomplete',
          detail: `A "${acu.name}" le faltan ${cost.missingMaterialIds.length} precio(s) de material: su costo actual es un piso, no el real.`,
        });
        continue;
      }

      const markup = row.acuMarkupPct ?? 0;
      const esperado = row.acuUnitCost != null ? applyMarkup(row.acuUnitCost, markup) : null;
      const manual =
        esperado !== null && Math.abs(esperado - row.unitPrice) >= ACU_COST_EPSILON;
      if (manual && dto.overrideManual !== true) {
        skipped.push({
          itemId: row.id,
          description: row.description,
          reason: 'manual-override',
          detail:
            'El unitario se escribió a mano después de congelar; no se pisa sin confirmarlo.',
        });
        continue;
      }

      const previousUnitCost = row.acuUnitCost ?? null;
      const previousUnitPrice = row.unitPrice;

      row.acuUnitCost = cost.directCost;
      row.acuPricedAt = ahora;
      row.acuIncomplete = cost.incomplete;
      row.unitPrice = applyMarkup(cost.directCost, markup);
      row.total = lineTotal(row);
      dirty.push(row);

      updated.push({
        itemId: row.id,
        description: row.description,
        previousUnitCost,
        unitCost: row.acuUnitCost,
        previousUnitPrice,
        unitPrice: row.unitPrice,
      });
    }

    if (dirty.length > 0) {
      await this.itemsRepository.save(dirty);
      await this.recalculate(quoteId);
    }

    const result = await this.findOne(quoteId);
    if (dirty.length > 0) {
      await this.savePdfForQuote(result).catch((err: Error) =>
        this.logger.error(`PDF regeneration failed for quote ${quoteId}: ${err.message}`),
      );
    }
    return { updated, skipped, quote: result };
  }

  /** Inserta un nivel del árbol y baja recursivamente. `startOrder` permite añadir al final. */
  private async persistChildren(
    quoteId: string,
    parentId: string | null,
    nodes: QuoteNode[],
    startOrder = 0,
  ): Promise<void> {
    for (const [index, node] of nodes.entries()) {
      const row = await this.itemsRepository.save(
        this.itemsRepository.create({
          quoteId,
          parentId: parentId ?? undefined,
          kind: node.kind,
          description: node.description,
          unit: node.unit ?? undefined,
          quantity: node.quantity,
          unitPrice: node.unitPrice,
          discountPct: node.discountPct,
          total: node.total,
          sortOrder: startOrder + index,
          ...acuColumns(node.acu),
        }),
      );
      if (node.children.length > 0) {
        await this.persistChildren(quoteId, row.id, node.children);
      }
    }
  }

  /**
   * Una línea suelta necesita cantidad y precio; un grupo no. Se comprueba aquí
   * y no en el DTO porque solo después de normalizar se sabe qué es cada nodo
   * (un nodo con hijos es grupo aunque llegue marcado como línea).
   */
  private assertTreeLimits(tree: QuoteNode[]): void {
    if (countNodes(tree) > MAX_TREE_NODES) {
      throw new BadRequestException(
        `Una cotización admite como máximo ${MAX_TREE_NODES} partidas y líneas`,
      );
    }
    if (treeDepth(tree) > MAX_TREE_DEPTH) {
      throw new BadRequestException(
        `Las partidas no pueden anidarse más de ${MAX_TREE_DEPTH} niveles`,
      );
    }

    const check = (nodes: QuoteNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'item') {
          if (!(node.quantity > 0)) {
            throw new BadRequestException(
              `La línea "${node.description}" necesita una cantidad mayor que 0`,
            );
          }
          if (node.unitPrice < 0) {
            throw new BadRequestException(
              `La línea "${node.description}" tiene un precio unitario inválido`,
            );
          }
        }
        check(node.children);
      }
    };
    check(tree);
  }

  /**
   * Recalcula el total de cada grupo a partir de sus descendientes y devuelve el
   * subtotal de la cotización, que suma SOLO las hojas (sumar también los grupos
   * contaría cada línea dos veces).
   */
  private async recomputeTreeTotals(quoteId: string): Promise<number> {
    const rows = await this.itemsRepository.findBy({ quoteId });
    if (rows.length === 0) return 0;

    const tree = rowsToTree(rows);
    let leafSubtotal = 0;

    const visit = (node: (typeof tree)[number]): number => {
      if (node.children.length === 0) {
        const total =
          node.row.kind === 'group' ? 0 : this.round2(Number(node.row.total));
        if (node.row.kind !== 'group') leafSubtotal = this.round2(leafSubtotal + total);
        return total;
      }
      const total = this.round2(
        node.children.reduce((sum, child) => sum + visit(child), 0),
      );
      if (Number(node.row.total) !== total) {
        node.row.total = total;
        node.row.kind = 'group';
      }
      return total;
    };

    for (const node of tree) visit(node);

    // Un nodo con hijos es grupo por definición: se persiste por si llegó como línea.
    const dirty = flattenTree(tree)
      .filter((n) => n.children.length > 0)
      .map((n) => n.row);
    if (dirty.length > 0) await this.itemsRepository.save(dirty);

    return leafSubtotal;
  }

  private async recalculate(quoteId: string): Promise<void> {
    const quote = await this.quotesRepository.findOneBy({ id: quoteId });
    if (!quote) return;

    const subtotal = await this.recomputeTreeTotals(quoteId);
    const base = Math.max(0, this.round2(subtotal - Number(quote.discount ?? 0)));

    if (Array.isArray(quote.indirectCosts)) {
      // Modo gastos indirectos: el backend recalcula los amounts.
      const { costs, taxAmount, total } = this.computeIndirectCosts(base, quote.indirectCosts);
      quote.subtotal = subtotal;
      quote.indirectCosts = costs;
      quote.taxAmount = taxAmount;
      quote.total = total;
    } else {
      // Legacy: ITBIS clásico (taxRate% sobre subtotal - discount).
      const taxAmount = this.round2(base * (Number(quote.taxRate ?? 18) / 100));
      quote.subtotal = subtotal;
      quote.taxAmount = taxAmount;
      quote.total = this.round2(base + taxAmount);
    }
    await this.quotesRepository.save(quote);
  }

  private async savePdfForQuote(quote: Quote): Promise<void> {
    const hasProject = !!quote.projectId;
    const context = hasProject ? FileContext.PROJECT_QUOTES : FileContext.CLIENT_QUOTES;

    const destDir = hasProject
      ? join(getUploadRoot(), 'clients', quote.clientId, 'projects', quote.projectId, 'quotes')
      : join(getUploadRoot(), 'clients', quote.clientId, 'quotes');

    mkdirSync(destDir, { recursive: true });

    const filename = `${quote.number}.pdf`;
    const filePath = join(destDir, filename);
    const relativePath = relative(getUploadRoot(), filePath);

    const company = await this.settingsService.getCompanyData();
    await generateQuotePdf(quote, filePath, company);
    const { size } = statSync(filePath);

    // Search by filename only — it is globally unique per quote and clientId may have changed
    const existing = await this.fileRepo.findOne({ where: { filename } });
    if (existing) {
      if (existing.path !== relativePath) {
        const oldAbsPath = join(getUploadRoot(), existing.path);
        if (existsSync(oldAbsPath)) {
          unlink(oldAbsPath, (err) => {
            if (err) this.logger.error(`Failed to delete old quote PDF ${oldAbsPath}: ${err.message}`);
          });
        }
      }
      await this.fileRepo.remove(existing);
    }

    const record = this.fileRepo.create({
      originalName: filename,
      filename,
      path: relativePath,
      mimetype: 'application/pdf',
      size,
      context,
      clientId: quote.clientId,
      projectId: quote.projectId ?? undefined,
      uploadedById: quote.createdById ?? undefined,
    });
    await this.fileRepo.save(record);
  }

  async findPdfFile(quoteId: string): Promise<FileUpload | null> {
    const quote = await this.quotesRepository.findOneBy({ id: quoteId });
    if (!quote) return null;
    return this.fileRepo.findOne({ where: { filename: `${quote.number}.pdf` } });
  }

  /**
   * Borra el PDF generado de una cotización: primero el registro de `uploaded_files`
   * y después el archivo del disco, en ese orden y como hace `FilesService.remove`.
   * Si se cayera entre medias queda un archivo suelto sin registro (invisible e
   * inocuo), no un registro apuntando a un archivo que ya no está (un 404 al
   * descargar).
   *
   * No propaga: se llama cuando la cotización YA está borrada y ese borrado no se
   * puede deshacer, así que fallar aquí solo empeora la respuesta.
   */
  private async removePdfByFilename(filename: string, label: string): Promise<void> {
    try {
      const record = await this.fileRepo.findOne({ where: { filename } });
      if (!record) return;
      const storedPath = record.path;
      await this.fileRepo.remove(record);
      this.unlinkStoredFile(storedPath);
    } catch (err) {
      this.logger.error(`No se pudo borrar el PDF de ${label}: ${(err as Error).message}`);
    }
  }

  /** Borra del disco una ruta relativa a la raíz de subidas. Falla solo en el log. */
  private unlinkStoredFile(relativePath: string): void {
    const absPath = join(getUploadRoot(), relativePath);
    if (!existsSync(absPath)) return;
    unlink(absPath, (err) => {
      if (err) this.logger.error(`Failed to delete quote PDF ${absPath}: ${err.message}`);
    });
  }

  private assertEditable(quote: Quote, userRole?: UserRole): void {
    this.assertNotSuperseded(quote);
    if (userRole === UserRole.ADMIN) return;
    if (quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.REJECTED) {
      throw new UnprocessableEntityException('Approved or rejected quotes cannot be modified');
    }
  }

  /**
   * Una cotización reemplazada es un documento histórico: no puede editarse,
   * reenviarse, aprobarse ni rechazarse. Aplica a todos los roles.
   */
  private assertNotSuperseded(quote: Quote): void {
    if (quote.supersededById) {
      throw new UnprocessableEntityException(
        'Esta cotización fue reemplazada por una revisión posterior y no puede modificarse ni reenviarse.',
      );
    }
  }

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const row = await this.quotesRepository
      .createQueryBuilder('q')
      .select(`MAX(CAST(SPLIT_PART(q.number, '-', 3) AS INTEGER))`, 'max')
      .where('q.number LIKE :pattern', { pattern: `COT-${year}-%` })
      .getRawOne<{ max: string | null }>();
    const next = (parseInt(row?.max ?? '0') || 0) + 1;
    return `COT-${year}-${String(next).padStart(3, '0')}`;
  }

  private async assertClientExists(id: string): Promise<void> {
    const exists = await this.clientsRepository.existsBy({ id });
    if (!exists) throw new BadRequestException(`Client ${id} not found`);
  }

  private async assertProjectExists(id: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id });
    if (!exists) throw new BadRequestException(`Project ${id} not found`);
  }
}
