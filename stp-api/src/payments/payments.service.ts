import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Quote)
    private readonly quotesRepository: Repository<Quote>,
  ) {}

  async create(dto: CreatePaymentDto, createdById: string): Promise<Payment> {
    await this.assertClientExists(dto.clientId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId);
    if (dto.quoteId) await this.assertQuoteExists(dto.quoteId);

    const payment = this.paymentsRepository.create({ ...dto, createdById });
    return this.paymentsRepository.save(payment);
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
    return this.paymentsRepository.save(payment);
  }

  async remove(id: string): Promise<void> {
    const payment = await this.findOne(id);
    await this.paymentsRepository.remove(payment);
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
}
