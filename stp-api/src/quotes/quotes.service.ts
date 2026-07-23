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
import { Repository } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, statSync, existsSync, unlink } from 'fs';
import { Quote, QuoteStatus, IndirectCost } from './entities/quote.entity';
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
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../users/entities/user.entity';
import { SettingsService } from '../settings/settings.service';

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

    const quote = this.quotesRepository.create({ ...quoteData, number, createdById });
    if (dto.status === QuoteStatus.SENT) quote.sentAt = new Date();
    const saved = await this.quotesRepository.save(quote);

    if (itemDtos?.length) {
      const items = itemDtos.map((d, idx) =>
        this.itemsRepository.create({
          ...d,
          quoteId: saved.id,
          total: parseFloat((d.quantity * d.unitPrice * (1 - (d.discountPct ?? 0) / 100)).toFixed(2)),
          sortOrder: d.sortOrder ?? idx,
        }),
      );
      await this.itemsRepository.save(items);
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

  async findAll(query: QueryQuotesDto) {
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

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.quotesRepository.findOne({
      where: { id },
      relations: { client: true, project: true, createdBy: true, items: true },
      order: { items: { sortOrder: 'ASC' } },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
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
    Object.assign(quote, defined);
    if (dto.status === QuoteStatus.SENT && previousStatus !== QuoteStatus.SENT) {
      quote.sentAt = new Date();
      quote.reminderCount = 0;
    }
    await this.quotesRepository.save(quote);

    if (itemsDto !== undefined) {
      await this.itemsRepository.delete({ quoteId: id });
      if (itemsDto.length > 0) {
        const newItems = itemsDto.map((d, idx) =>
          this.itemsRepository.create({
            ...d,
            quoteId: id,
            total: parseFloat((d.quantity * d.unitPrice * (1 - (d.discountPct ?? 0) / 100)).toFixed(2)),
            sortOrder: d.sortOrder ?? idx,
          }),
        );
        await this.itemsRepository.save(newItems);
      }
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
    await this.quotesRepository.remove(quote);
  }

  async convertToProject(id: string, createdById: string): Promise<Project> {
    const quote = await this.findOne(id);

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

  // ── Items ──────────────────────────────────────────────────────────────────

  async addItem(quoteId: string, dto: CreateQuoteItemDto, userRole?: UserRole): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote, userRole);

    const count = await this.itemsRepository.countBy({ quoteId });
    const item = this.itemsRepository.create({
      ...dto,
      quoteId,
      total: parseFloat((dto.quantity * dto.unitPrice * (1 - (dto.discountPct ?? 0) / 100)).toFixed(2)),
      sortOrder: dto.sortOrder ?? count,
    });
    await this.itemsRepository.save(item);
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
    item.total = parseFloat((item.quantity * item.unitPrice * (1 - (item.discountPct ?? 0) / 100)).toFixed(2));
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

  private async recalculate(quoteId: string): Promise<void> {
    const [quote, items] = await Promise.all([
      this.quotesRepository.findOneBy({ id: quoteId }),
      this.itemsRepository.findBy({ quoteId }),
    ]);
    if (!quote) return;

    const subtotal = this.round2(items.reduce((sum, i) => sum + Number(i.total), 0));
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

  private assertEditable(quote: Quote, userRole?: UserRole): void {
    if (userRole === UserRole.ADMIN) return;
    if (quote.status === QuoteStatus.APPROVED || quote.status === QuoteStatus.REJECTED) {
      throw new UnprocessableEntityException('Approved or rejected quotes cannot be modified');
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
