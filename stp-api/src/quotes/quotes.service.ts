import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, statSync } from 'fs';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
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
  ) {}

  onModuleInit() {
    void this.expireOverdueQuotes();
    setInterval(() => void this.expireOverdueQuotes(), 24 * 60 * 60 * 1000);
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
        this.notifications.sendQuoteExpired({
          clientEmail: quote.client.email,
          clientName: quote.client.name,
          quoteNumber: quote.number,
          quoteTitle: quote.title,
          validUntil: quote.validUntil,
        });
      }
    }
  }

  async create(dto: CreateQuoteDto, createdById: string): Promise<Quote> {
    await this.assertClientExists(dto.clientId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId);

    const number = await this.generateNumber();
    const { items: itemDtos, ...quoteData } = dto;

    const quote = this.quotesRepository.create({ ...quoteData, number, createdById });
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
    }

    const result = await this.findOne(saved.id);

    if (dto.status === QuoteStatus.SENT && result.client?.email) {
      this.notifications.sendQuoteSent({
        clientEmail: result.client.email,
        clientName: result.client.name,
        quoteNumber: result.number,
        quoteTitle: result.title,
        total: result.total,
        validUntil: result.validUntil,
      });
    }

    await this.savePdfForQuote(result).catch((err: Error) =>
      this.logger.error(`PDF generation failed for quote ${result.id}: ${err.message}`),
    );

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
    } else if (dto.taxRate !== undefined || dto.discount !== undefined) {
      await this.recalculate(id);
    }

    const updated = await this.findOne(id);

    if (dto.status && dto.status !== previousStatus) {
      if (dto.status === QuoteStatus.SENT && updated.client?.email) {
        this.notifications.sendQuoteSent({
          clientEmail: updated.client.email,
          clientName: updated.client.name,
          quoteNumber: updated.number,
          quoteTitle: updated.title,
          total: updated.total,
          validUntil: updated.validUntil,
        });
      }
      if (dto.status === QuoteStatus.APPROVED) {
        this.notifications.sendQuoteApproved({
          quoteNumber: updated.number,
          quoteTitle: updated.title,
          clientName: updated.client?.name ?? 'Cliente',
          total: updated.total,
        });
      }
      if (dto.status === QuoteStatus.REJECTED && updated.client?.email) {
        this.notifications.sendQuoteRejected({
          clientEmail: updated.client.email,
          clientName: updated.client.name,
          quoteNumber: updated.number,
          quoteTitle: updated.title,
        });
      }
    }

    await this.savePdfForQuote(updated).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for quote ${id}: ${err.message}`),
    );

    return updated;
  }

  async remove(id: string): Promise<void> {
    const quote = await this.findOne(id);
    await this.quotesRepository.remove(quote);
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
    return this.findOne(quoteId);
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
    return this.findOne(quoteId);
  }

  async removeItem(quoteId: string, itemId: string, userRole?: UserRole): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote, userRole);

    const item = await this.itemsRepository.findOne({ where: { id: itemId, quoteId } });
    if (!item) throw new NotFoundException('Item not found');

    await this.itemsRepository.remove(item);
    await this.recalculate(quoteId);
    return this.findOne(quoteId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async recalculate(quoteId: string): Promise<void> {
    const [quote, items] = await Promise.all([
      this.quotesRepository.findOneBy({ id: quoteId }),
      this.itemsRepository.findBy({ quoteId }),
    ]);
    if (!quote) return;

    const subtotal = items.reduce((sum, i) => sum + Number(i.total), 0);
    const taxableAmount = Math.max(0, subtotal - Number(quote.discount ?? 0));
    const taxAmount = parseFloat((taxableAmount * (Number(quote.taxRate ?? 18) / 100)).toFixed(2));
    const total = parseFloat((taxableAmount + taxAmount).toFixed(2));

    quote.subtotal = subtotal;
    quote.taxAmount = taxAmount;
    quote.total = total;
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

    await generateQuotePdf(quote, filePath);

    const { size } = statSync(filePath);
    const relativePath = relative(getUploadRoot(), filePath);

    // Replace existing record (regeneration on update)
    const existing = await this.fileRepo.findOne({
      where: { filename, clientId: quote.clientId },
    });
    if (existing) await this.fileRepo.remove(existing);

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
