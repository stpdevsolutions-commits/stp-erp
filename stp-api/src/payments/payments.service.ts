import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, statSync, existsSync, unlink } from 'fs';
import { Payment } from './entities/payment.entity';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { FileUpload, FileContext } from '../files/entities/file-upload.entity';
import { getUploadRoot } from '../files/files.utils';
import { generatePaymentPdf } from './pdf.generator';
import { SettingsService } from '../settings/settings.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { loadForUpdate } from '../common/load-for-update';
import { escapeLike } from '../common/like-escape';
import { auditLog } from '../common/audit-log';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { PaymentStatus } from './entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AppNotificationsService } from '../notifications/app-notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { money } from '../notifications/email-layout';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';
import { UserRole } from '../users/entities/user.entity';

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
    private readonly appNotifications: AppNotificationsService,
    private readonly settingsService: SettingsService,
    private readonly access: AccessControlService,
  ) {}

  async create(dto: CreatePaymentDto, createdById: string): Promise<Payment> {
    await this.assertClientExists(dto.clientId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId, dto.clientId);
    if (dto.quoteId) await this.assertQuoteExists(dto.quoteId, dto.clientId);

    const payment = this.paymentsRepository.create({ ...dto, createdById });
    const saved = await this.paymentsRepository.save(payment);
    const loaded = await this.findOne(saved.id);

    if (loaded.status === PaymentStatus.COMPLETED) {
      this.notifyPaymentReceived(loaded);
    }

    await this.savePdfForPayment(loaded).catch((err: Error) =>
      this.logger.error(`PDF generation failed for payment ${loaded.id}: ${err.message}`),
    );

    return loaded;
  }

  private notifyPaymentReceived(payment: Payment): void {
    try {
      this.notifications.sendPaymentReceived({
        clientName: payment.client?.name ?? 'Cliente',
        amount: payment.amount,
        description: payment.description,
        method: payment.method,
        reference: payment.reference,
        date: payment.date,
      });
    } catch (err) {
      this.logger.error(`Payment notification failed for ${payment.id}: ${(err as Error).message}`);
    }
    // In-app (ERP-107): a todo admin/finanza, no a una persona puntual — son
    // los únicos roles con acceso al módulo Pagos completo (ver
    // module-permissions.ts; manager solo tiene 'view').
    void this.appNotifications.notifyRoles(
      [UserRole.ADMIN, UserRole.FINANZA],
      NotificationType.PAYMENT_RECEIVED,
      `Pago recibido: ${money(payment.amount)}`,
      payment.client?.name ? `${payment.client.name} — ${payment.description}` : payment.description,
      `/dashboard/pagos`,
    );
  }

  async findAll(query: QueryPaymentsDto, user?: AccessSubject) {
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
        { q: `%${escapeLike(search)}%` },
      );
    }

    await this.access.applyScope(qb, user, {
      projectExpr: 'payment.projectId',
      clientExpr: 'payment.clientId',
    });

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
    // Sin relaciones: el objeto `client`/`project`/`quote` cargado pisaría la
    // columna FK y el cambio no se guardaría (ver loadForUpdate).
    const payment = await loadForUpdate(
      this.paymentsRepository,
      id,
      'Payment not found',
    );
    const previousStatus = payment.status;

    if (dto.clientId && dto.clientId !== payment.clientId) {
      await this.assertClientExists(dto.clientId);
    }

    // Se valida contra el cliente que el pago va a tener DESPUÉS del cambio, no solo
    // contra lo que trae el dto: si se cambia el cliente pero no el proyecto/cotización,
    // el que ya tenía puede haber quedado de otro cliente.
    const effectiveClientId = dto.clientId ?? payment.clientId;
    const effectiveProjectId = dto.projectId !== undefined ? dto.projectId : payment.projectId;
    const effectiveQuoteId = dto.quoteId !== undefined ? dto.quoteId : payment.quoteId;
    if (effectiveProjectId) await this.assertProjectExists(effectiveProjectId, effectiveClientId);
    if (effectiveQuoteId) await this.assertQuoteExists(effectiveQuoteId, effectiveClientId);

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(payment, defined);
    await this.paymentsRepository.save(payment);
    const updated = await this.findOne(id);

    if (updated.status === PaymentStatus.COMPLETED && previousStatus !== PaymentStatus.COMPLETED) {
      this.notifyPaymentReceived(updated);
    }

    await this.savePdfForPayment(updated).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for payment ${id}: ${err.message}`),
    );
    return updated;
  }

  async remove(id: string, requesterId?: string): Promise<void> {
    const payment = await this.findOne(id);
    auditLog(requesterId, 'payment.deleted', { paymentId: id, amount: payment.amount });
    await this.paymentsRepository.remove(payment);
    // El PDF se limpia DESPUÉS y sin propagar, igual que en gastos: el dato es el
    // pago, y un fallo de disco no puede devolver un error por algo accesorio.
    await this.removePdfForPayment(id);
  }

  async findPdfFile(paymentId: string): Promise<FileUpload | null> {
    return this.fileRepo.findOne({ where: { filename: `PAGO-${paymentId}.pdf` } });
  }

  /**
   * Borra el PDF generado de un pago: primero el registro de `uploaded_files` y
   * después el archivo del disco, en ese orden y como hace `FilesService.remove`.
   * Si se cayera entre medias queda un archivo suelto sin registro (invisible e
   * inocuo), no un registro apuntando a un archivo que ya no está (un 404 al
   * descargar).
   *
   * No propaga: se llama cuando el pago YA está borrado y ese borrado no se puede
   * deshacer, así que fallar aquí solo empeora la respuesta.
   */
  private async removePdfForPayment(paymentId: string): Promise<void> {
    try {
      const record = await this.fileRepo.findOne({
        where: { filename: `PAGO-${paymentId}.pdf` },
      });
      if (!record) return;
      const storedPath = record.path;
      await this.fileRepo.remove(record);
      this.unlinkStoredFile(storedPath);
    } catch (err) {
      this.logger.error(
        `No se pudo borrar el PDF del pago ${paymentId}: ${(err as Error).message}`,
      );
    }
  }

  /** Borra del disco una ruta relativa a la raíz de subidas. Falla solo en el log. */
  private unlinkStoredFile(relativePath: string): void {
    const absPath = join(getUploadRoot(), relativePath);
    if (!existsSync(absPath)) return;
    unlink(absPath, (err) => {
      if (err) this.logger.error(`Failed to delete payment PDF ${absPath}: ${err.message}`);
    });
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

  private async assertProjectExists(projectId: string, clientId?: string): Promise<void> {
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });
    if (!project) throw new BadRequestException(`Project ${projectId} not found`);
    if (clientId && project.clientId !== clientId) {
      throw new BadRequestException('El proyecto indicado no pertenece a ese cliente');
    }
  }

  private async assertQuoteExists(quoteId: string, clientId?: string): Promise<void> {
    const quote = await this.quotesRepository.findOne({ where: { id: quoteId } });
    if (!quote) throw new BadRequestException(`Quote ${quoteId} not found`);
    if (clientId && quote.clientId !== clientId) {
      throw new BadRequestException('La cotización indicada no pertenece a ese cliente');
    }
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

    const company = await this.settingsService.getCompanyData();
    await generatePaymentPdf(payment, filePath, company);

    const { size } = statSync(filePath);
    const relativePath = relative(getUploadRoot(), filePath);

    // Search by filename only — it is globally unique per payment and clientId may have changed
    const existing = await this.fileRepo.findOne({ where: { filename } });
    if (existing) {
      if (existing.path !== relativePath) {
        const oldAbsPath = join(getUploadRoot(), existing.path);
        if (existsSync(oldAbsPath)) {
          unlink(oldAbsPath, (err) => {
            if (err) this.logger.error(`Failed to delete old payment PDF ${oldAbsPath}: ${err.message}`);
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
      clientId: payment.clientId,
      projectId: payment.projectId ?? undefined,
      uploadedById: payment.createdById ?? undefined,
    });
    await this.fileRepo.save(record);
  }
}
