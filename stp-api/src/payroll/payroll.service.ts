import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import {
  PayrollEntry,
  PayrollStatus,
} from './entities/payroll-entry.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { Project } from '../projects/entities/project.entity';
import { ExpensesService } from '../expenses/expenses.service';
import { ExpenseCategory } from '../expenses/entities/expense.entity';
import { CreatePayrollEntryDto } from './dto/create-payroll-entry.dto';
import { UpdatePayrollEntryDto } from './dto/update-payroll-entry.dto';
import { QueryPayrollDto } from './dto/query-payroll.dto';
import { computePayrollAmounts } from './payroll-amounts';
import { SettingsService } from '../settings/settings.service';
import { generatePayrollReceiptPdf } from './pdf.generator';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @InjectRepository(PayrollEntry)
    private readonly payrollRepository: Repository<PayrollEntry>,
    @InjectRepository(Collaborator)
    private readonly collaboratorsRepository: Repository<Collaborator>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly expensesService: ExpensesService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Recibo de pago en PDF, para imprimir y firmar. Se genera al vuelo con los
   * datos actuales del pago en vez de guardarse: el recibo es un papel que se
   * imprime, no un documento del que haya que conservar versiones.
   */
  async generateReceipt(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const entry = await this.findOne(id);
    const company = await this.settingsService.getCompanyData();
    const buffer = await generatePayrollReceiptPdf(entry, company);
    return { buffer, filename: `${entry.number}.pdf` };
  }

  async create(
    dto: CreatePayrollEntryDto,
    createdById: string,
  ): Promise<PayrollEntry> {
    const collaborator = await this.getCollaborator(dto.collaboratorId);
    if (dto.projectId) await this.assertProjectExists(dto.projectId);
    this.assertPeriod(dto.periodStart, dto.periodEnd);

    // La tarifa se congela en el pago: si mañana sube la del colaborador, los
    // pagos ya registrados no deben cambiar de importe.
    const dailyRate = dto.dailyRate ?? collaborator.dailyRate ?? null;
    const amounts = computePayrollAmounts({ ...dto, dailyRate });

    const entry = this.payrollRepository.create({
      ...dto,
      dailyRate: dailyRate as number,
      ...amounts,
      number: await this.generateNumber(),
      createdById,
    });
    const saved = await this.payrollRepository.save(entry);
    await this.syncExpense(saved);
    return this.findOne(saved.id);
  }

  async findAll(query: QueryPayrollDto) {
    const {
      search,
      collaboratorId,
      projectId,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.payrollRepository
      .createQueryBuilder('payroll')
      .leftJoinAndSelect('payroll.collaborator', 'collaborator')
      .leftJoinAndSelect('payroll.project', 'project')
      .orderBy('payroll.periodEnd', 'DESC')
      .addOrderBy('payroll.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('payroll.number ILIKE :q', { q: `%${search}%` })
            .orWhere('collaborator.firstName ILIKE :q', { q: `%${search}%` })
            .orWhere('collaborator.lastName ILIKE :q', { q: `%${search}%` })
            .orWhere('collaborator.cedula ILIKE :q', { q: `%${search}%` });
        }),
      );
    }
    if (collaboratorId)
      qb.andWhere('payroll.collaboratorId = :collaboratorId', { collaboratorId });
    if (projectId) qb.andWhere('payroll.projectId = :projectId', { projectId });
    if (status) qb.andWhere('payroll.status = :status', { status });
    // Solapamiento de períodos: un pago entra si su rango toca el rango filtrado.
    if (dateFrom) qb.andWhere('payroll.periodEnd >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('payroll.periodStart <= :dateTo', { dateTo });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<PayrollEntry> {
    const entry = await this.payrollRepository.findOne({
      where: { id },
      relations: { collaborator: true, project: true, createdBy: true },
    });
    if (!entry) throw new NotFoundException('Payroll entry not found');
    return entry;
  }

  async update(id: string, dto: UpdatePayrollEntryDto): Promise<PayrollEntry> {
    const entry = await this.findOne(id);

    if (dto.collaboratorId && dto.collaboratorId !== entry.collaboratorId) {
      await this.getCollaborator(dto.collaboratorId);
    }
    if (dto.projectId && dto.projectId !== entry.projectId) {
      await this.assertProjectExists(dto.projectId);
    }
    this.assertPeriod(
      dto.periodStart ?? entry.periodStart,
      dto.periodEnd ?? entry.periodEnd,
    );

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(
        ([, v]) => v !== undefined,
      ),
    );
    Object.assign(entry, defined);

    const amounts = computePayrollAmounts(entry);
    entry.grossAmount = amounts.grossAmount;
    entry.netAmount = amounts.netAmount;

    // Marcar como pagado sin fecha: se asume hoy, que es lo que el usuario espera.
    if (entry.status === PayrollStatus.PAID && !entry.paymentDate) {
      entry.paymentDate = new Date().toISOString().split('T')[0];
    }

    const saved = await this.payrollRepository.save(entry);
    await this.syncExpense(saved);
    return this.findOne(saved.id);
  }

  async remove(id: string): Promise<void> {
    const entry = await this.findOne(id);
    await this.detachExpense(entry);
    await this.payrollRepository.remove(entry);
  }

  /** Cifras de cabecera del módulo (no dependen de la página que se esté viendo). */
  async summary() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .split('T')[0];
    const yearStart = `${now.getUTCFullYear()}-01-01`;

    const sum = async (
      status: PayrollStatus,
      column: 'paymentDate' | 'periodEnd',
      from?: string,
    ) => {
      const qb = this.payrollRepository
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.netAmount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('p.status = :status', { status });
      if (from) qb.andWhere(`p.${column} >= :from`, { from });
      const row = await qb.getRawOne<{ total: string; count: string }>();
      return {
        total: parseFloat(row?.total ?? '0'),
        count: parseInt(row?.count ?? '0', 10),
      };
    };

    const [pending, paidMonth, paidYear] = await Promise.all([
      sum(PayrollStatus.PENDING, 'periodEnd'),
      sum(PayrollStatus.PAID, 'paymentDate', monthStart),
      sum(PayrollStatus.PAID, 'paymentDate', yearStart),
    ]);

    return {
      pendingCount: pending.count,
      pendingAmount: pending.total,
      paidThisMonth: paidMonth.total,
      paidThisMonthCount: paidMonth.count,
      paidThisYear: paidYear.total,
    };
  }

  // ── Puente con Gastos ─────────────────────────────────────────────────────

  /**
   * Mantiene el gasto de mano de obra en sintonía con el pago.
   *
   * Solo existe gasto si el pago está PAGADO y tiene proyecto (la tabla
   * `expenses` exige `projectId`). El importe imputado es el **bruto**: es el
   * costo de la mano de obra del período para la empresa; los descuentos solo
   * cambian cuánto se entrega en mano, no lo que costó el trabajo.
   *
   * Un fallo aquí no debe tumbar el registro del pago (el dato de nómina es el
   * que manda), así que se registra en el log y se sigue.
   */
  private async syncExpense(entry: PayrollEntry): Promise<void> {
    const shouldExist =
      entry.status === PayrollStatus.PAID && !!entry.projectId;

    try {
      if (!shouldExist) {
        await this.detachExpense(entry);
        return;
      }

      const payload = {
        projectId: entry.projectId,
        description: this.expenseDescription(entry),
        category: ExpenseCategory.LABOR,
        amount: entry.grossAmount,
        date: entry.paymentDate ?? entry.periodEnd,
        notes: `Generado automáticamente desde nómina ${entry.number}.`,
      };

      if (entry.expenseId) {
        await this.expensesService.update(entry.expenseId, payload);
        return;
      }

      const expense = await this.expensesService.create(
        payload,
        entry.createdById,
      );
      await this.payrollRepository.update(entry.id, { expenseId: expense.id });
      entry.expenseId = expense.id;
    } catch (err) {
      this.logger.error(
        `No se pudo sincronizar el gasto de la nómina ${entry.number}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /** Borra el gasto enlazado, si lo hay, y suelta la referencia. */
  private async detachExpense(entry: PayrollEntry): Promise<void> {
    if (!entry.expenseId) return;
    const expenseId = entry.expenseId;
    entry.expenseId = null as unknown as string;
    await this.payrollRepository.update(entry.id, {
      expenseId: null as unknown as string,
    });
    await this.expensesService.remove(expenseId).catch((err: Error) => {
      // Si el gasto ya no existe (borrado a mano) no hay nada que arreglar.
      this.logger.warn(
        `No se pudo borrar el gasto ${expenseId} de la nómina ${entry.number}: ${err.message}`,
      );
    });
  }

  private expenseDescription(entry: PayrollEntry): string {
    const name = entry.collaborator
      ? `${entry.collaborator.firstName} ${entry.collaborator.lastName}`
      : 'colaborador';
    return `Mano de obra — ${name} (${entry.periodStart} a ${entry.periodEnd})`;
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const row = await this.payrollRepository
      .createQueryBuilder('p')
      .select(`MAX(CAST(SPLIT_PART(p.number, '-', 3) AS INTEGER))`, 'max')
      .where('p.number LIKE :pattern', { pattern: `NOM-${year}-%` })
      .getRawOne<{ max: string | null }>();
    const next = (parseInt(row?.max ?? '0') || 0) + 1;
    return `NOM-${year}-${String(next).padStart(3, '0')}`;
  }

  private assertPeriod(start: string, end: string): void {
    if (start && end && end < start) {
      throw new BadRequestException(
        'El fin del período no puede ser anterior a su inicio',
      );
    }
  }

  private async getCollaborator(id: string): Promise<Collaborator> {
    const collaborator = await this.collaboratorsRepository.findOne({
      where: { id },
    });
    if (!collaborator)
      throw new BadRequestException(`Collaborator ${id} not found`);
    return collaborator;
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id: projectId });
    if (!exists) throw new BadRequestException(`Project ${projectId} not found`);
  }
}
