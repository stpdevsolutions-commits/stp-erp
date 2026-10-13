import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, DataSource, EntityManager } from 'typeorm';
import {
  PayrollEntry,
  PayrollPaymentType,
  PayrollStatus,
} from './entities/payroll-entry.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { Project } from '../projects/entities/project.entity';
import { ExpensesService } from '../expenses/expenses.service';
import { ExpenseCategory } from '../expenses/entities/expense.entity';
import { CollaboratorLoansService } from './collaborator-loans.service';
import { CreatePayrollEntryDto } from './dto/create-payroll-entry.dto';
import { UpdatePayrollEntryDto } from './dto/update-payroll-entry.dto';
import { QueryPayrollDto } from './dto/query-payroll.dto';
import { computePayrollAmounts, periodDays } from './payroll-amounts';
import { loadForUpdate } from '../common/load-for-update';
import { SettingsService } from '../settings/settings.service';
import { generatePayrollReceiptPdf } from './pdf.generator';
import { monthStartRD, todayRD, yearStartRD } from '../common/dates';
import { retryOnUniqueViolation } from '../common/save-with-unique-code';
import {
  assertNetNotNegative,
  duplicatePayrollMessage,
  findDuplicatePayroll,
} from './payroll-guards';

interface SyncOptions {
  /** Dentro de una transacción: el UPDATE del enlace al gasto usa este manager. */
  manager?: EntityManager;
  /** Si es true, un fallo de sincronización se propaga en vez de solo registrarse. */
  strict?: boolean;
  /** Avisa del gasto recién creado, para poder limpiarlo si la operación falla después. */
  onExpenseCreated?: (expenseId: string) => void;
}

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
    private readonly loansService: CollaboratorLoansService,
    private readonly dataSource: DataSource,
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
    // pagos ya registrados no deben cambiar de importe. La tarifa del
    // colaborador solo aplica como default para pago por día — para m²/m³/ml/
    // P.A. no existe una tarifa por defecto, así que hay que escribirla siempre.
    const paymentType = dto.paymentType ?? PayrollPaymentType.DAY;
    const dailyRate =
      dto.dailyRate ??
      (paymentType === PayrollPaymentType.DAY ? collaborator.dailyRate : null) ??
      null;
    // A suma alzada no tiene "cantidad": se fija en 1 para que la tarifa SEA el monto
    // total, en vez de confiar en que el cliente también lo mande así — el frontend lo
    // hace, pero la API no puede depender de eso.
    const daysWorked =
      paymentType === PayrollPaymentType.LUMP_SUM ? 1 : dto.daysWorked;
    this.assertDaysWithinPeriod(paymentType, daysWorked, dto.periodStart, dto.periodEnd);

    // Todo en UNA transacción: pago + cuota del préstamo + gasto. Si algo falla, no queda
    // un pago sin gasto ni un préstamo con saldo bajado sin pago. El UNIQUE del número
    // (choque entre dos creaciones simultáneas) reintenta la transacción entera, porque
    // en Postgres un error aborta la transacción en curso.
    let createdExpenseId: string | undefined;
    let savedId: string;
    try {
      savedId = await retryOnUniqueViolation(
        () =>
          this.dataSource.transaction(async (em) => {
            createdExpenseId = undefined;
            const payrollRepo = em.getRepository(PayrollEntry);

            // Bloquea al colaborador: dos pagos simultáneos suyos se ejecutan en fila, así
            // la comprobación de duplicado y el saldo del préstamo son fiables.
            await em.getRepository(Collaborator).findOne({
              where: { id: dto.collaboratorId },
              lock: { mode: 'pessimistic_write' },
              loadEagerRelations: false,
            });
            await this.assertNoDuplicate(
              {
                collaboratorId: dto.collaboratorId,
                projectId: dto.projectId ?? null,
                periodStart: dto.periodStart,
                periodEnd: dto.periodEnd,
                paymentType,
              },
              undefined,
              em,
            );

            // ERP-91: si el colaborador tiene un préstamo activo, su cuota (topada al
            // saldo) se suma a los descuentos de este pago automáticamente. Se hace
            // ANTES de computePayrollAmounts para que netAmount ya la refleje —
            // `deductions` es un solo total, no hay un campo aparte para "lo manual"
            // vs "lo del préstamo" (ver comentario en la entidad). El préstamo se lee
            // con bloqueo (pessimistic_write) para no descontar dos veces sobre el mismo saldo.
            const loan = await this.loansService.findActiveForCollaborator(
              dto.collaboratorId,
              em,
            );
            const loanDeductionAmount = loan
              ? Math.round(Math.min(loan.installmentAmount, loan.balance) * 100) / 100
              : null;
            const totalDeductions = (dto.deductions ?? 0) + (loanDeductionAmount ?? 0);

            const amounts = computePayrollAmounts({
              ...dto,
              dailyRate,
              daysWorked,
              deductions: totalDeductions,
            });
            assertNetNotNegative(amounts, totalDeductions);

            const entry = payrollRepo.create({
              ...dto,
              dailyRate: dailyRate as number,
              daysWorked,
              deductions: totalDeductions,
              ...amounts,
              loanId: loan?.id ?? null,
              loanDeductionAmount,
              number: await this.generateNumber(em),
              createdById,
            });
            const saved = await payrollRepo.save(entry);
            if (loan && loanDeductionAmount) {
              await this.loansService.applyInstallment(loan, loanDeductionAmount, em);
            }
            await this.syncExpense(saved, {
              manager: em,
              strict: true,
              onExpenseCreated: (expenseId) => {
                createdExpenseId = expenseId;
              },
            });
            return saved.id;
          }),
        { label: 'el pago de nómina' },
      );
    } catch (err) {
      // La transacción ya se revirtió; el gasto se creó por otra conexión, hay que quitarlo.
      await this.discardExpense(createdExpenseId);
      throw err;
    }
    return this.findOne(savedId);
  }

  async findAll(query: QueryPayrollDto) {
    const {
      search,
      collaboratorId,
      projectId,
      status,
      paymentType,
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
    if (paymentType) qb.andWhere('payroll.paymentType = :paymentType', { paymentType });
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
    // Sin relaciones: el objeto `collaborator`/`project` cargado pisaría la columna FK
    // y un cambio de colaborador o proyecto no se guardaría (ver loadForUpdate).
    const entry = await loadForUpdate(this.payrollRepository, id, 'Payroll entry not found');

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
    // Copia de las columnas antes de tocarlas, para deshacer si el gasto no se puede sincronizar.
    const before = { ...entry };

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(
        ([, v]) => v !== undefined,
      ),
    );
    Object.assign(entry, defined);

    // Mismo motivo que en create(): a suma alzada la cantidad no puede ser distinta de 1.
    if (entry.paymentType === PayrollPaymentType.LUMP_SUM) {
      entry.daysWorked = 1;
    }
    // Solo si el pago cambia en algo que afecte la cuenta: editar el estado de un
    // pago viejo con datos ya inconsistentes no debe quedar bloqueado por esto.
    if (
      dto.paymentType !== undefined ||
      dto.daysWorked !== undefined ||
      dto.periodStart !== undefined ||
      dto.periodEnd !== undefined
    ) {
      this.assertDaysWithinPeriod(
        entry.paymentType,
        entry.daysWorked,
        entry.periodStart,
        entry.periodEnd,
      );
    }

    // La cuota del préstamo ya se aplicó (y bajó el saldo) al crear el pago; editar NO la
    // reaplica. Pero tampoco se puede dejar `deductions` por debajo de esa cuota: el saldo
    // del préstamo ya bajó y el neto subiría sin que nadie haya entregado ese dinero.
    if (
      dto.deductions !== undefined &&
      entry.loanDeductionAmount &&
      entry.deductions < entry.loanDeductionAmount
    ) {
      throw new BadRequestException(
        `Los descuentos no pueden ser menores que la cuota de préstamo ya aplicada en este pago (${entry.loanDeductionAmount.toFixed(2)}). ` +
          'Para revertirla, elimina el pago.',
      );
    }

    const amounts = computePayrollAmounts(entry);
    // Solo si se tocó algo del cálculo: editar el estado de un pago viejo con importes
    // ya inconsistentes no debe quedar bloqueado por esto.
    if (
      dto.paymentType !== undefined ||
      dto.daysWorked !== undefined ||
      dto.dailyRate !== undefined ||
      dto.overtimeAmount !== undefined ||
      dto.bonuses !== undefined ||
      dto.deductions !== undefined ||
      dto.retentionPercent !== undefined
    ) {
      assertNetNotNegative(amounts, entry.deductions);
    }
    entry.grossAmount = amounts.grossAmount;
    entry.retentionAmount = amounts.retentionAmount;
    entry.netAmount = amounts.netAmount;

    if (
      dto.collaboratorId !== undefined ||
      dto.projectId !== undefined ||
      dto.periodStart !== undefined ||
      dto.periodEnd !== undefined ||
      dto.paymentType !== undefined
    ) {
      await this.assertNoDuplicate(entry, entry.id);
    }

    // Marcar como pagado sin fecha: se asume hoy, que es lo que el usuario espera.
    if (entry.status === PayrollStatus.PAID && !entry.paymentDate) {
      entry.paymentDate = todayRD();
    }

    const saved = await this.payrollRepository.save(entry);
    let createdExpenseId: string | undefined;
    try {
      await this.syncExpense(saved, {
        strict: true,
        onExpenseCreated: (expenseId) => {
          createdExpenseId = expenseId;
        },
      });
    } catch (err) {
      // No dejar el pago cambiado (p. ej. PAGADO) sin su gasto: se restauran las columnas.
      await this.payrollRepository
        .save(this.payrollRepository.create(before))
        .catch((e: Error) =>
          this.logger.error(`No se pudo revertir la nómina ${entry.number}: ${e.message}`),
        );
      await this.discardExpense(createdExpenseId);
      throw err;
    }
    return this.findOne(saved.id);
  }

  async remove(id: string): Promise<void> {
    const entry = await this.findOne(id);
    await this.detachExpense(entry);
    if (entry.loanId && entry.loanDeductionAmount) {
      await this.loansService.refundInstallment(entry.loanId, entry.loanDeductionAmount);
    }
    await this.payrollRepository.remove(entry);
  }

  /** Cifras de cabecera del módulo (no dependen de la página que se esté viendo). */
  async summary() {
    const monthStart = monthStartRD();
    const yearStart = yearStartRD();

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
   * costo de la mano de obra del período para la empresa; los descuentos y la
   * retención solo cambian cuánto se entrega en mano, no lo que costó el trabajo.
   *
   * Con `strict` (create/update) un fallo se registra en el log como error y se
   * propaga como 500: el pago NO puede quedar PAGADO sin su gasto, así que quien llama
   * revierte (la transacción en create, la restauración de columnas en update).
   */
  private async syncExpense(entry: PayrollEntry, options: SyncOptions = {}): Promise<void> {
    const shouldExist =
      entry.status === PayrollStatus.PAID && !!entry.projectId;
    const payrollRepo = options.manager
      ? options.manager.getRepository(PayrollEntry)
      : this.payrollRepository;

    try {
      if (!shouldExist) {
        await this.detachExpense(entry, options.manager);
        return;
      }

      // create()/update() llaman con la entidad recién guardada, que no trae la
      // relación `collaborator` cargada: sin esto el gasto salía como
      // "Mano de obra — colaborador" en vez de con el nombre.
      const collaborator =
        entry.collaborator ??
        (await this.collaboratorsRepository.findOne({
          where: { id: entry.collaboratorId },
        }));

      const payload = {
        projectId: entry.projectId,
        description: this.expenseDescription(entry, collaborator),
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
      options.onExpenseCreated?.(expense.id);
      await payrollRepo.update(entry.id, { expenseId: expense.id });
      entry.expenseId = expense.id;
    } catch (err) {
      this.logger.error(
        `No se pudo sincronizar el gasto de la nómina ${entry.number}: ${
          (err as Error).message
        }`,
      );
      if (options.strict) {
        throw new InternalServerErrorException(
          'No se pudo registrar el gasto de mano de obra del pago; el cambio no se guardó. Intenta de nuevo.',
        );
      }
    }
  }

  /** Quita un gasto creado por una operación que luego falló (best-effort, con log). */
  private async discardExpense(expenseId?: string): Promise<void> {
    if (!expenseId) return;
    await this.expensesService.remove(expenseId).catch((e: Error) =>
      this.logger.error(`Gasto huérfano ${expenseId} tras una nómina fallida: ${e.message}`),
    );
  }

  /** 409 si ya hay un pago (no cancelado) del mismo colaborador, proyecto, período y tipo. */
  private async assertNoDuplicate(
    candidate: {
      collaboratorId: string;
      projectId?: string | null;
      periodStart: string;
      periodEnd: string;
      paymentType: string;
    },
    ignoreId?: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(PayrollEntry) : this.payrollRepository;
    const existing = await repo.find({
      where: {
        collaboratorId: candidate.collaboratorId,
        periodStart: candidate.periodStart.slice(0, 10),
        periodEnd: candidate.periodEnd.slice(0, 10),
      },
      loadEagerRelations: false,
    });
    const dup = findDuplicatePayroll(candidate, existing, ignoreId);
    if (dup) throw new ConflictException(duplicatePayrollMessage(dup));
  }

  /** Borra el gasto enlazado, si lo hay, y suelta la referencia. */
  private async detachExpense(entry: PayrollEntry, manager?: EntityManager): Promise<void> {
    if (!entry.expenseId) return;
    const expenseId = entry.expenseId;
    entry.expenseId = null as unknown as string;
    await (manager ? manager.getRepository(PayrollEntry) : this.payrollRepository).update(entry.id, {
      expenseId: null as unknown as string,
    });
    await this.expensesService.remove(expenseId).catch((err: Error) => {
      // Si el gasto ya no existe (borrado a mano) no hay nada que arreglar.
      this.logger.warn(
        `No se pudo borrar el gasto ${expenseId} de la nómina ${entry.number}: ${err.message}`,
      );
    });
  }

  private expenseDescription(
    entry: PayrollEntry,
    collaborator: Collaborator | null,
  ): string {
    const name = collaborator
      ? `${collaborator.firstName} ${collaborator.lastName}`.trim()
      : 'colaborador';
    return `Mano de obra — ${name} (${entry.periodStart} a ${entry.periodEnd})`;
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  private async generateNumber(manager?: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const row = await (manager ? manager.getRepository(PayrollEntry) : this.payrollRepository)
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

  /**
   * En un pago por día la cantidad son días trabajados: no puede pasar de los
   * días que tiene el período. Atrapa el error típico de escribir metros o un
   * monto en el campo de cantidad con el tipo de pago equivocado.
   */
  private assertDaysWithinPeriod(
    paymentType: PayrollPaymentType,
    daysWorked: number | null | undefined,
    start: string,
    end: string,
  ): void {
    if (paymentType !== PayrollPaymentType.DAY || !daysWorked || !start || !end) return;
    const maxDays = periodDays(start, end);
    if (daysWorked > maxDays) {
      throw new BadRequestException(
        `Se indicaron ${daysWorked} días trabajados pero el período solo tiene ${maxDays}. ` +
          'Si el pago es por m², m³, ml o partida alzada, cambia el tipo de pago.',
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
