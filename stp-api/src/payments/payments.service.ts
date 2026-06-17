import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, statSync } from 'fs';
import { Payment } from './entities/payment.entity';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { FileUpload, FileContext } from '../files/entities/file-upload.entity';
import { getUploadRoot } from '../files/files.utils';
import { generatePaymentPdf } from './pdf.generator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { PaymentStatus } from './entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Quote)
    private readonly quotesRepository: Repository<Quote>,
    @InjectRepository(FileUpload)
    private readonly fileRepo: Repository<FileUpload>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreatePaymentDto, createdById: string): Promise<Payment> {
    await this.assertClientExists(dto.clientId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId);
    if (dto.quoteId) await this.assertQuoteExists(dto.quoteId);

    const payment = this.paymentsRepository.create({ ...dto, createdById });
    const saved = await this.paymentsRepository.save(payment);
    const loaded = await this.findOne(saved.id);

    if (loaded.status === PaymentStatus.COMPLETED) {
      this.notifications.sendPaymentReceived({
        clientName: loaded.client?.name ?? 'Cliente',
        amount: loaded.amount,
        description: loaded.description,
        method: loaded.method,
        reference: loaded.reference,
        date: loaded.date,
      });
    }

    await this.savePdfForPayment(loaded).catch((err: Error) =>
      this.logger.error(`PDF generation failed for payment ${loaded.id}: ${err.message}`),
    );

    return loaded;
  }

  async findAll(query: QueryPaymentsDto) {
    const {
      clientId, projectId, quoteId, method, status,
      dateFrom, dateTo, search, page = 1, limit = 20,
    } = query;

    const qb = this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.client', 'client')
      .leftJoinAndSelect('payment.project', 'project')
      .leftJoinAndSelect('payment.quote', 'quote')
      .leftJoinAndSelect('payment.createdBy', 'createdBy')
      .orderBy('payment.date', 'DESC')
      .addOrderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (clientId) qb.andWhere('payment.clientId = :clientId', { clientId });
    if (projectId) qb.andWhere('payment.projectId = :projectId', { projectId });
    if (quoteId) qb.andWhere('payment.quoteId = :quoteId', { quoteId });
    if (method) qb.andWhere('payment.method = :method', { method });
    if (status) qb.andWhere('payment.status = :status', { status });
    if (dateFrom) qb.andWhere('payment.date >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('payment.date <= :dateTo', { dateTo });
    if (search) {
      qb.andWhere(
        '(payment.description ILIKE :q OR payment.reference ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id },
      relations: { client: true, project: true, quote: true, createdBy: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async update(id: string, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findOne(id);

    if (dto.clientId && dto.clientId !== payment.clientId) {
      await this.assertClientExists(dto.clientId);
    }
    if (dto.projectId && dto.projectId !== payment.projectId) {
      await this.assertProjectExists(dto.projectId);
    }
    if (dto.quoteId && dto.quoteId !== payment.quoteId) {
      await this.assertQuoteExists(dto.quoteId);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(payment, defined);
    await this.paymentsRepository.save(payment);
    const updated = await this.findOne(id);
    await this.savePdfForPayment(updated).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for payment ${id}: ${err.message}`),
    );
    return updated;
  }

  async remove(id: string): Promise<void> {
    const payment = await this.findOne(id);
    await this.paymentsRepository.remove(payment);
  }

  async findPdfFile(paymentId: string): Promise<FileUpload | null> {
    return this.fileRepo.findOne({ where: { filename: `PAGO-${paymentId}.pdf` } });
  }

  async sumByClient(clientId: string): Promise<number> {
    const { sum } = await this.paymentsRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.amount)', 'sum')
      .where('payment.clientId = :clientId AND payment.status = :status', {
        clientId,
        status: 'completed',
      })
      .getRawOne();
    return parseFloat(sum ?? '0');
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const exists = await this.clientsRepository.existsBy({ id: clientId });
    if (!exists) throw new BadRequestException(`Client ${clientId} not found`);
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id: projectId });
    if (!exists) throw new BadRequestException(`Project ${projectId} not found`);
  }

  private async assertQuoteExists(quoteId: string): Promise<void> {
    const exists = await this.quotesRepository.existsBy({ id: quoteId });
    if (!exists) throw new BadRequestException(`Quote ${quoteId} not found`);
  }

  private async savePdfForPayment(payment: Payment): Promise<void> {
    const hasProject = !!payment.projectId;
    const context = hasProject ? FileContext.PROJECT_PAYMENTS : FileContext.CLIENT_PAYMENTS;

    const destDir = hasProject
      ? join(getUploadRoot(), 'clients', payment.clientId, 'projects', payment.projectId, 'payments')
      : join(getUploadRoot(), 'clients', payment.clientId, 'payments');
    mkdirSync(destDir, { recursive: true });

    const filename = `PAGO-${payment.id}.pdf`;
    const filePath = join(destDir, filename);

    await generatePaymentPdf(payment, filePath);

    const { size } = statSync(filePath);
    const relativePath = relative(getUploadRoot(), filePath);

    const existing = await this.fileRepo.findOne({ where: { filename, clientId: payment.clientId } });
    if (existing) await this.fileRepo.remove(existing);

    const record = this.fileRepo.create({
      originalName: filename,
      filename,
      path: relativePath,
      mimetype: 'application/pdf',
      size,
      context,
      clientId: payment.clientId,
      projectId: payment.projectId ?? undefined,
      uploadedById: payment.createdById ?? undefined,
    });
    await this.fileRepo.save(record);
  }
}
