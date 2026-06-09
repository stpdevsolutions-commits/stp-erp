import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { QuoteItem } from './entities/quote-item.entity';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote)
    private readonly quotesRepository: Repository<Quote>,
    @InjectRepository(QuoteItem)
    private readonly itemsRepository: Repository<QuoteItem>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateQuoteDto, createdById: string): Promise<Quote> {
    await this.assertClientExists(dto.clientId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId);

    const number = await this.generateNumber();
    const { items: itemDtos, ...quoteData } = dto;

    const quote = this.quotesRepository.create({ ...quoteData, number, createdById });
    const saved = await this.quotesRepository.save(quote);

    if (itemDtos?.length) {
      const items = itemDtos.map((dto, idx) =>
        this.itemsRepository.create({
          ...dto,
          quoteId: saved.id,
          total: dto.quantity * dto.unitPrice,
          sortOrder: dto.sortOrder ?? idx,
        }),
      );
      await this.itemsRepository.save(items);
      await this.recalculate(saved.id);
    }

    return this.findOne(saved.id);
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

  async update(id: string, dto: UpdateQuoteDto): Promise<Quote> {
    const quote = await this.findOne(id);
    this.assertEditable(quote);

    const previousStatus = quote.status;

    if (dto.clientId && dto.clientId !== quote.clientId) {
      await this.assertClientExists(dto.clientId);
    }
    if (dto.projectId && dto.projectId !== quote.projectId) {
      await this.assertProjectExists(dto.projectId);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(quote, defined);
    await this.quotesRepository.save(quote);

    if (dto.taxRate !== undefined || dto.discount !== undefined) {
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
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    const quote = await this.findOne(id);
    await this.quotesRepository.remove(quote);
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  async addItem(quoteId: string, dto: CreateQuoteItemDto): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote);

    const count = await this.itemsRepository.countBy({ quoteId });
    const item = this.itemsRepository.create({
      ...dto,
      quoteId,
      total: dto.quantity * dto.unitPrice,
      sortOrder: dto.sortOrder ?? count,
    });
    await this.itemsRepository.save(item);
    await this.recalculate(quoteId);
    return this.findOne(quoteId);
  }

  async updateItem(quoteId: string, itemId: string, dto: UpdateQuoteItemDto): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote);

    const item = await this.itemsRepository.findOne({ where: { id: itemId, quoteId } });
    if (!item) throw new NotFoundException('Item not found');

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(item, defined);
    item.total = item.quantity * item.unitPrice;
    await this.itemsRepository.save(item);
    await this.recalculate(quoteId);
    return this.findOne(quoteId);
  }

  async removeItem(quoteId: string, itemId: string): Promise<Quote> {
    const quote = await this.findOne(quoteId);
    this.assertEditable(quote);

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

  private assertEditable(quote: Quote): void {
    if (quote.status === QuoteStatus.APPROVED) {
      throw new UnprocessableEntityException('Approved quotes cannot be modified');
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
