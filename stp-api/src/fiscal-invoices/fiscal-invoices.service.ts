import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { existsSync, unlink } from 'fs';
import { join, relative } from 'path';
import { FiscalInvoice } from './entities/fiscal-invoice.entity';
import {
  CreateFiscalInvoiceDto,
  ExpenseCandidatesQueryDto,
  LinkPairDto,
  QueryFiscalInvoicesDto,
  UpdateFiscalInvoiceDto,
} from './dto/fiscal-invoice.dto';
import {
  DATE_WINDOW_DAYS,
  matchExpenses,
  suggestAll,
  type ExpenseMatch,
  type MatchExpense,
} from './expense-match';
import { expenseCategoryFor, invoiceTotal, isValidNcf, isValidRnc, ncfTypeOf, normalizeRnc } from './fiscal-invoice-rules';
import { InvoiceScanService } from './invoice-scan.service';
import { matchesMagic, normalizeScan, type ScanCore, type ScanResult } from './invoice-scan';
import { QrParseError, parseDgiiQr } from './qr-ecf';
import { applyHistory, summarizeHistory, type SupplierHistory } from './supplier-history';
import { ExpensesService } from '../expenses/expenses.service';
import { Expense, ExpenseCategory } from '../expenses/entities/expense.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { getUploadRoot, validateFileMagicBytes } from '../files/files.utils';
import { auditLog } from '../common/audit-log';
import { DgiiService } from '../dgii/dgii.service';
import type { ComprobanteResult } from '../dgii/dgii-html';
import { SettingsService } from '../settings/settings.service';

/** Más facturas que esto en una sola exportación no es un 606 normal. */
const EXPORT_LIMIT = 5000;

/** Resultados de la DGII que dan el comprobante por bueno. */
const DGII_OK_STATES = ['Vigente', 'Aceptado', 'Aceptado Condicional', 'Válido', 'Valido'];

/** Pausa entre consultas a la DGII al validar en bloque, para no saturar su portal. */
const DGII_PAUSE_MS = 400;

/** Lo que `repo.update` acepta (sin las relaciones, que no se escriben por aquí). */
type InvoicePatch = Parameters<Repository<FiscalInvoice>['update']>[1];

@Injectable()
export class FiscalInvoicesService {
  constructor(
    @InjectRepository(FiscalInvoice)
    private readonly repo: Repository<FiscalInvoice>,
    private readonly dgii: DgiiService,
    private readonly settings: SettingsService,
    private readonly expenses: ExpensesService,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    private readonly scanner: InvoiceScanService,
  ) {}

  private readonly logger = new Logger(FiscalInvoicesService.name);

  async create(dto: CreateFiscalInvoiceDto, createdById: string): Promise<FiscalInvoice> {
    await this.assertNotDuplicate(dto.supplierRnc, dto.ncf);
    if (dto.expenseId && dto.projectId !== undefined) {
      throw new BadRequestException('Elige un destino nuevo (proyecto o general) o vincular a un gasto, no las dos cosas.');
    }
    // El vínculo con un gasto existente se hace aparte y con comprobaciones, nunca escribiéndolo directo.
    const { expenseId: linkTo, syncExpense, ...fields } = dto;

    const invoice = this.repo.create({
      ...fields,
      ncfType: this.typeOrFail(dto.ncf),
      paymentMethod: dto.paymentMethod ?? '01',
      createdById,
    });
    invoice.totalAmount = invoiceTotal(invoice);
    let saved: FiscalInvoice;
    try {
      saved = await this.repo.save(invoice);
    } catch (err) {
      // Dos altas casi a la vez de la misma factura: la segunda la frena el índice único.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException(`Ya está registrada la factura ${dto.ncf} de ese emisor.`);
      }
      throw err;
    }

    // Con destino (proyecto o general) la factura origina su gasto en el ERP. Si el gasto
    // no se puede crear, la factura tampoco queda: no se deja una a medias.
    if (dto.projectId !== undefined || linkTo) {
      try {
        if (linkTo) await this.linkExpense(saved.id, linkTo, createdById, !!syncExpense);
        else await this.applyDestination(saved, dto.projectId, createdById);
      } catch (err) {
        await this.repo.delete(saved.id);
        throw err;
      }
    }
    return this.findOne(saved.id);
  }

  /**
   * Crea o actualiza el gasto de esta factura (ERP-39). `projectId`: un proyecto, `null`
   * = gasto general, `undefined` = no cambiar el destino (si ya hay gasto solo se sincroniza;
   * si no lo hay, no se crea). El proveedor se busca por RNC y, si no existe, se crea.
   */
  private async applyDestination(
    invoice: FiscalInvoice,
    projectId: string | null | undefined,
    userId: string,
  ): Promise<void> {
    if (!invoice.expenseId && projectId === undefined) return;

    // Gasto que ya existía y solo se vinculó (ERP-50): no se le pisan los datos; a lo sumo
    // cambia de proyecto si se pidió.
    if (invoice.expenseId && !invoice.expenseOwned) {
      if (projectId !== undefined) await this.expenses.update(invoice.expenseId, { projectId });
      return;
    }

    const payload = await this.expensePayload(invoice);

    if (invoice.expenseId) {
      await this.expenses.update(invoice.expenseId, {
        ...payload,
        ...(projectId !== undefined ? { projectId } : {}),
      });
      return;
    }
    const expense = await this.expenses.create({ ...payload, projectId }, userId);
    await this.repo.update(invoice.id, { expenseId: expense.id });
  }

  /** Lo que la factura pone en su gasto: descripción, categoría, monto, fecha, proveedor y notas. */
  private async expensePayload(invoice: FiscalInvoice) {
    const supplierId = await this.ensureSupplier(invoice);
    return {
      description: `${invoice.supplierName} — ${invoice.ncf}`,
      category: expenseCategoryFor(invoice.expenseType) as ExpenseCategory,
      amount: invoice.totalAmount,
      date: invoice.invoiceDate,
      supplierId,
      notes: invoice.notes ? `Factura ${invoice.ncf}. ${invoice.notes}` : `Factura ${invoice.ncf}`,
    };
  }

  /** Proveedor del ERP con ese RNC (se compara sin guiones); si no existe, se crea. */
  private async ensureSupplier(invoice: FiscalInvoice): Promise<string> {
    const found = await this.suppliers
      .createQueryBuilder('s')
      .where("REPLACE(REPLACE(s.rnc, '-', ''), ' ', '') = :rnc", { rnc: invoice.supplierRnc })
      .getOne();
    if (found) return found.id;
    const created = await this.suppliers.save(
      this.suppliers.create({ name: invoice.supplierName, rnc: invoice.supplierRnc }),
    );
    return created.id;
  }

  /**
   * Lee una factura (foto o PDF) con IA y devuelve los campos sugeridos para el formulario,
   * con avisos de lo dudoso. NO guarda nada: la persona revisa y confirma (ERP-36).
   */
  async scan(buffer: Buffer, mimeType: string): Promise<ScanResult> {
    if (!matchesMagic(buffer, mimeType)) {
      throw new BadRequestException('El contenido del archivo no coincide con su tipo. Usa una foto JPG, PNG, WEBP o un PDF.');
    }
    const { raw } = await this.scanner.read(buffer, mimeType);
    return this.enrich(normalizeScan(raw), 'ia', null);
  }

  /**
   * Lee el QR de un e-CF (ERP-36): del propio QR salen el RNC, el e-NCF, la fecha, el total y el
   * código de seguridad; la DGII aporta el nombre, el ITBIS y el estado si responde. No guarda nada.
   */
  async fromQr(text: string): Promise<ScanResult> {
    let qr;
    try {
      qr = parseDgiiQr(text);
    } catch (err) {
      if (err instanceof QrParseError) throw new BadRequestException(err.message);
      throw err;
    }

    const warnings: string[] = [];
    const [timbre, rnc, company] = await Promise.all([
      this.dgii.fetchTimbre(qr.url),
      this.dgii.lookupRnc(qr.supplierRnc).catch(() => null),
      this.settings.getCompanyData(),
    ]);

    const total = timbre?.total ?? qr.total ?? 0;
    const itbis = timbre?.itbis ?? qr.itbis;
    if (itbis === null || itbis === undefined) {
      warnings.push('El QR no trae el ITBIS: si la factura lo lleva, ajusta la base y el ITBIS antes de guardar.');
    }
    if (timbre?.notFound) {
      warnings.push('La DGII no encontró este comprobante con los datos del QR: verifica que sea el correcto.');
    }
    const ownRnc = normalizeRnc(company.rnc ?? '');
    if (qr.buyerRnc && ownRnc && qr.buyerRnc !== ownRnc) {
      warnings.push(`Este comprobante está a nombre de otro RNC (${qr.buyerRnc}), no el de la empresa: ¿es de STP?`);
    }

    // Estado en la DGII: el de la página del timbre; si no vino, la consulta del portal con código.
    let estado = timbre?.estado ?? null;
    if (!estado && qr.securityCode) {
      const check = await this.dgii
        .checkComprobante({
          rnc: qr.supplierRnc,
          ncf: qr.ncf,
          rncComprador: qr.buyerRnc ?? ownRnc,
          codigoSeguridad: qr.securityCode,
        })
        .catch(() => null);
      if (check && (check.verdict === 'valid' || check.verdict === 'rejected')) estado = check.estado;
    }

    const base = itbis != null ? Math.max(0, total - itbis) : total;
    const core: ScanCore = {
      fields: {
        ncf: qr.ncf,
        supplierRnc: qr.supplierRnc,
        supplierName: timbre?.supplierName ?? rnc?.name ?? '',
        invoiceDate: qr.invoiceDate,
        baseAmount: Math.round(base * 100) / 100,
        itbis: itbis ?? 0,
        isc: 0,
        tip: 0,
        otherTax: 0,
        paymentMethod: '01',
        expenseType: null,
        securityCode: qr.securityCode,
        notes: '',
      },
      totalAmount: total || null,
      confidence: 'high',
      missing: [],
      warnings,
    };
    if (!core.fields.supplierName) warnings.push('No se pudo traer el nombre del emisor: escríbelo o búscalo por el RNC.');
    if (!core.fields.invoiceDate) warnings.push('El QR no trae una fecha válida: elígela a mano.');
    return this.enrich(core, 'qr', estado);
  }

  /** Lo aprendido de las facturas anteriores de ese proveedor (RNC en dígitos). */
  async historyFor(supplierRnc: string): Promise<SupplierHistory & { supplierName: string | null }> {
    const rows = await this.repo.find({
      where: { supplierRnc },
      select: { expenseType: true, paymentMethod: true, invoiceDate: true, supplierName: true },
      order: { invoiceDate: 'DESC' },
      take: 30,
    });
    return { ...summarizeHistory(rows), supplierName: rows[0]?.supplierName ?? null };
  }

  /** Sugerencias para el formulario manual: al escribir el RNC de un proveedor conocido. */
  async suggest(rawRnc: string) {
    const rnc = normalizeRnc(rawRnc);
    if (!isValidRnc(rnc)) throw new BadRequestException('RNC inválido: 9 dígitos (11 si es cédula)');
    const h = await this.historyFor(rnc);
    return {
      count: h.count,
      supplierName: h.supplierName,
      expenseType: h.expenseType?.value ?? null,
      expenseTypeShare: h.expenseType?.share ?? null,
      paymentMethod: h.paymentMethod?.value ?? null,
      paymentMethodShare: h.paymentMethod?.share ?? null,
    };
  }

  /**
   * Remata una lectura (foto o QR): aplica el hábito del proveedor al tipo de gasto y a la forma
   * de pago, y avisa si la factura ya estaba registrada.
   */
  private async enrich(core: ScanCore, source: 'ia' | 'qr', estadoDgii: string | null): Promise<ScanResult> {
    const hints: string[] = [];
    const { supplierRnc, ncf } = core.fields;

    if (isValidRnc(supplierRnc)) {
      const history = await this.historyFor(supplierRnc);
      if (history.count > 0) {
        const a = applyHistory(core.fields, history, source);
        core.fields.expenseType = a.expenseType;
        core.fields.paymentMethod = a.paymentMethod;
        if (!core.fields.supplierName && history.supplierName) core.fields.supplierName = history.supplierName;
        if (a.applied.length > 0) {
          const que = a.applied.map((f) => (f === 'expenseType' ? 'el tipo de gasto' : 'la forma de pago'));
          hints.push(
            `Proveedor conocido: ${que.join(' y ')} se tomaron de tus ${history.count} factura(s) anterior(es). Cámbialo si esta compra es distinta.`,
          );
        }
      }
    }

    // Si ya está registrada, se avisa antes de que la persona termine de llenar el formulario.
    let duplicate: ScanResult['duplicate'] = null;
    if (isValidNcf(ncf) && isValidRnc(supplierRnc)) {
      const found = await this.repo.findOne({ where: { supplierRnc, ncf } });
      if (found) {
        duplicate = { id: found.id, ncf: found.ncf, supplierName: found.supplierName, invoiceDate: found.invoiceDate };
        core.warnings.unshift(`Esta factura ya está registrada (${found.supplierName}, ${found.invoiceDate}).`);
      }
    }
    return { ...core, duplicate, source, hints, estadoDgii };
  }

  /** La factura que originó un gasto (para mostrarla en el detalle del gasto). */
  async findByExpense(expenseId: string): Promise<FiscalInvoice> {
    const invoice = await this.repo.findOne({ where: { expenseId } });
    if (!invoice) throw new NotFoundException('Este gasto no viene de una factura fiscal');
    return invoice;
  }

  /**
   * Asigna varias facturas a un proyecto (o a gastos generales con `null`). Cada una va
   * por su cuenta: una que falle no frena a las demás, y se devuelve cuáles fallaron.
   */
  async assign(
    ids: string[],
    projectId: string | null,
    userId: string,
  ): Promise<{ updated: number; failed: { id: string; error: string }[] }> {
    let updated = 0;
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.applyDestination(await this.findOne(id), projectId, userId);
        updated += 1;
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
    return { updated, failed };
  }

  // ── Vincular con gastos ya registrados a mano (ERP-50) ──────────────────────

  /** Gastos que todavía no tienen factura, con lo necesario para compararlos y mostrarlos. */
  private async unlinkedExpenses(dateFrom?: string, dateTo?: string) {
    const qb = this.expenseRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.supplier', 's')
      .leftJoinAndSelect('e.project', 'p')
      .where('NOT EXISTS (SELECT 1 FROM fiscal_invoices f WHERE f."expenseId" = e.id)');
    if (dateFrom) qb.andWhere('e.date >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('e.date <= :dateTo', { dateTo });
    return qb.orderBy('e.date', 'DESC').getMany();
  }

  private toMatchExpense(e: Expense): MatchExpense {
    return {
      id: e.id,
      description: e.description,
      amount: e.amount,
      date: e.date,
      notes: e.notes,
      supplierRnc: e.supplier?.rnc ?? null,
      supplierName: e.supplier?.name ?? null,
    };
  }

  /** Datos del gasto para mostrar en pantalla. */
  private expenseSummary(e: Expense) {
    return {
      id: e.id,
      description: e.description,
      amount: e.amount,
      date: e.date,
      notes: e.notes,
      supplierName: e.supplier?.name ?? null,
      projectId: e.projectId,
      projectCode: e.project?.code ?? null,
      projectName: e.project?.name ?? null,
    };
  }

  private dateWindow(date: string) {
    const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    const shift = (days: number) => new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    return { from: shift(-DATE_WINDOW_DAYS), to: shift(DATE_WINDOW_DAYS) };
  }

  /** Gastos ya registrados que se parecen a una factura (guardada o por guardar). */
  async expenseCandidates(input: ExpenseCandidatesQueryDto) {
    const { from, to } = this.dateWindow(input.invoiceDate);
    const expenses = await this.unlinkedExpenses(from, to);
    const byId = new Map(expenses.map((e) => [e.id, e]));
    const matches = matchExpenses(
      {
        supplierRnc: input.supplierRnc ?? '',
        supplierName: input.supplierName ?? '',
        totalAmount: input.totalAmount,
        baseAmount: input.baseAmount,
        invoiceDate: input.invoiceDate,
      },
      expenses.map((e) => this.toMatchExpense(e)),
    );
    return matches.map((m) => ({ ...m, expense: this.expenseSummary(byId.get(m.expenseId)!) }));
  }

  async candidatesForInvoice(id: string) {
    const inv = await this.findOne(id);
    if (inv.expenseId) return [];
    return this.expenseCandidates({
      supplierRnc: inv.supplierRnc,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      baseAmount: inv.baseAmount,
      invoiceDate: inv.invoiceDate,
    });
  }

  /**
   * Conciliación: para cada factura sin gasto, el gasto manual que más se le parece (cada gasto
   * se propone a una sola factura). Solo trae las que tienen alguna coincidencia.
   */
  async reconciliation() {
    const [invoices, expenses] = await Promise.all([
      this.repo.find({ where: { expenseId: IsNull() }, order: { invoiceDate: 'DESC' } }),
      this.unlinkedExpenses(),
    ]);
    const invById = new Map(invoices.map((i) => [i.id, i]));
    const expById = new Map(expenses.map((e) => [e.id, e]));
    const suggestions = suggestAll(
      invoices.map((i) => ({
        id: i.id,
        supplierRnc: i.supplierRnc,
        supplierName: i.supplierName,
        totalAmount: i.totalAmount,
        baseAmount: i.baseAmount,
        invoiceDate: i.invoiceDate,
      })),
      expenses.map((e) => this.toMatchExpense(e)),
    );
    const withExpense = (m: ExpenseMatch) => ({ ...m, expense: this.expenseSummary(expById.get(m.expenseId)!) });
    return {
      unlinkedInvoices: invoices.length,
      unlinkedExpenses: expenses.length,
      items: suggestions.map((sg) => {
        const i = invById.get(sg.invoiceId)!;
        return {
          invoice: {
            id: i.id,
            ncf: i.ncf,
            supplierName: i.supplierName,
            supplierRnc: i.supplierRnc,
            invoiceDate: i.invoiceDate,
            totalAmount: i.totalAmount,
            baseAmount: i.baseAmount,
          },
          best: withExpense(sg.best),
          ambiguous: sg.ambiguous,
          alternatives: sg.alternatives.map(withExpense),
        };
      }),
    };
  }

  /**
   * Vincula una factura a un gasto que ya existía. El gasto se conserva tal cual (con sus notas y
   * su foto); con `syncExpense` se le ponen además el monto, la fecha y el proveedor de la factura.
   */
  async linkExpense(invoiceId: string, expenseId: string, userId: string, syncExpense = false): Promise<FiscalInvoice> {
    const invoice = await this.findOne(invoiceId);
    if (invoice.expenseId) throw new ConflictException('Esta factura ya tiene un gasto.');
    const expense = await this.expenseRepo.findOne({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    const taken = await this.repo.findOne({ where: { expenseId } });
    if (taken) throw new ConflictException(`Ese gasto ya está enlazado a la factura ${taken.ncf} de ${taken.supplierName}.`);

    await this.repo.update(invoiceId, { expenseId, expenseOwned: false });
    if (syncExpense) await this.expenses.update(expenseId, await this.expensePayload(invoice));
    auditLog(userId, 'fiscal-invoice.expense-linked', { invoiceId, ncf: invoice.ncf, expenseId, syncExpense });
    return this.findOne(invoiceId);
  }

  /** Suelta el gasto de una factura. El gasto no se borra: queda como estaba, sin factura. */
  async unlinkExpense(invoiceId: string, userId: string): Promise<FiscalInvoice> {
    const invoice = await this.findOne(invoiceId);
    if (!invoice.expenseId) throw new ConflictException('Esta factura no tiene gasto.');
    await this.repo.update(invoiceId, { expenseId: null, expenseOwned: true });
    auditLog(userId, 'fiscal-invoice.expense-unlinked', { invoiceId, ncf: invoice.ncf, expenseId: invoice.expenseId });
    return this.findOne(invoiceId);
  }

  /** Confirma varias vinculaciones de la conciliación; las que fallan se informan sin frenar las demás. */
  async applyLinks(pairs: LinkPairDto[], userId: string) {
    let linked = 0;
    const failed: { invoiceId: string; error: string }[] = [];
    for (const p of pairs) {
      try {
        await this.linkExpense(p.invoiceId, p.expenseId, userId, !!p.syncExpense);
        linked += 1;
      } catch (err) {
        failed.push({ invoiceId: p.invoiceId, error: err instanceof Error ? err.message : 'Error desconocido' });
      }
    }
    return { linked, failed };
  }

  /** Consulta base con los filtros del listado; la comparten la pantalla y la exportación. */
  private filteredQuery(query: QueryFiscalInvoicesDto) {
    const { search, dateFrom, dateTo, expenseType, project } = query;
    const { projectId, paymentMethod, ncfType, dgii, assigned, hasPhoto, amountMin, amountMax } = query;

    const qb = this.repo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.expense', 'expense')
      .leftJoinAndSelect('expense.project', 'project');

    if (search) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('inv.ncf ILIKE :term', { term })
            .orWhere('inv.supplierRnc ILIKE :term', { term })
            .orWhere('inv.supplierName ILIKE :term', { term }),
        ),
      );
    }
    if (dateFrom) qb.andWhere('inv.invoiceDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('inv.invoiceDate <= :dateTo', { dateTo });
    if (expenseType) qb.andWhere('inv.expenseType = :expenseType', { expenseType });
    if (project === 'with') qb.andWhere('expense.projectId IS NOT NULL');
    if (project === 'without') qb.andWhere('expense.projectId IS NULL');
    if (projectId) qb.andWhere('expense.projectId = :projectId', { projectId });
    if (paymentMethod) qb.andWhere('inv.paymentMethod = :paymentMethod', { paymentMethod });
    if (ncfType) qb.andWhere('inv.ncfType = :ncfType', { ncfType });
    if (dgii === 'pending') qb.andWhere('inv.dgiiEstado IS NULL');
    if (dgii === 'valid') qb.andWhere('inv.dgiiEstado IN (:...okStates)', { okStates: DGII_OK_STATES });
    if (dgii === 'issue') {
      qb.andWhere('inv.dgiiEstado IS NOT NULL AND inv.dgiiEstado NOT IN (:...okStates)', { okStates: DGII_OK_STATES });
    }
    if (assigned === 'assigned') qb.andWhere('inv.expenseId IS NOT NULL');
    if (assigned === 'unassigned') qb.andWhere('inv.expenseId IS NULL');
    if (hasPhoto === 'yes') qb.andWhere('inv.photoPath IS NOT NULL');
    if (hasPhoto === 'no') qb.andWhere('inv.photoPath IS NULL');
    if (amountMin !== undefined) qb.andWhere('inv.totalAmount >= :amountMin', { amountMin });
    if (amountMax !== undefined) qb.andWhere('inv.totalAmount <= :amountMax', { amountMax });
    return qb;
  }

  async findAll(query: QueryFiscalInvoicesDto) {
    const { page = 1, limit = 20 } = query;

    const qb = this.filteredQuery(query)
      .orderBy('inv.invoiceDate', 'DESC')
      .addOrderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Suma de TODO lo filtrado (no solo la página), igual que Gastos.
    const sumQb = this.filteredQuery(query).select('COALESCE(SUM(inv.totalAmount), 0)', 'sum');

    const [[data, total], sumRow] = await Promise.all([
      qb.getManyAndCount(),
      sumQb.getRawOne<{ sum: string }>(),
    ]);
    return { data, total, page, limit, totalAmount: parseFloat(sumRow?.sum ?? '0') };
  }

  /**
   * Todas las facturas que cumplen los filtros, sin paginar y en orden cronológico
   * (así sale el 606). Con un tope: si lo supera se pide acotar el período en vez de
   * cortar la planilla en silencio.
   */
  async findForExport(query: QueryFiscalInvoicesDto): Promise<FiscalInvoice[]> {
    const rows = await this.filteredQuery(query)
      .orderBy('inv.invoiceDate', 'ASC')
      .addOrderBy('inv.ncf', 'ASC')
      .take(EXPORT_LIMIT + 1)
      .getMany();
    if (rows.length > EXPORT_LIMIT) {
      throw new BadRequestException(
        `Hay más de ${EXPORT_LIMIT} facturas con esos filtros: acota el período (el 606 es mensual).`,
      );
    }
    return rows;
  }

  async findOne(id: string): Promise<FiscalInvoice> {
    const invoice = await this.repo.findOne({
      where: { id },
      relations: { expense: { project: true } },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  async update(id: string, dto: UpdateFiscalInvoiceDto, userId: string): Promise<FiscalInvoice> {
    const invoice = await this.findOne(id);

    const rnc = dto.supplierRnc ?? invoice.supplierRnc;
    const ncf = dto.ncf ?? invoice.ncf;
    if (rnc !== invoice.supplierRnc || ncf !== invoice.ncf) {
      await this.assertNotDuplicate(rnc, ncf, id);
    }

    // `projectId` no es una columna de la factura (es el destino de su gasto): se aparta.
    const { projectId, ...fields } = dto;
    const defined = Object.fromEntries(
      Object.entries(fields as Record<string, unknown>).filter(([, v]) => v !== undefined),
    ) as Partial<FiscalInvoice>;
    const merged = { ...invoice, ...defined };

    const patch: InvoicePatch = {
      ...(defined as InvoicePatch),
      ncfType: this.typeOrFail(merged.ncf),
      totalAmount: invoiceTotal(merged),
    };
    // Cambió lo fiscal: el resultado de la DGII ya no habla de esta factura.
    if (dto.ncf !== undefined || dto.supplierRnc !== undefined) {
      patch.dgiiEstado = null;
      patch.dgiiValidatedAt = null;
    }

    await this.repo.update(id, patch);

    // El gasto enlazado sigue a la factura (monto, fecha, proveedor, descripción) y, si se
    // pide, cambia de proyecto. Sin gasto y sin destino, no hay nada que sincronizar.
    const updated = await this.findOne(id);
    await this.applyDestination(updated, projectId, userId);
    return this.findOne(id);
  }

  async remove(id: string, requesterId?: string): Promise<void> {
    const invoice = await this.findOne(id);
    auditLog(requesterId, 'fiscal-invoice.deleted', {
      invoiceId: id,
      ncf: invoice.ncf,
      supplierRnc: invoice.supplierRnc,
      total: invoice.totalAmount,
    });
    const photo = invoice.photoPath;
    // Solo se borra el gasto que nació de esta factura; uno vinculado ya existía y se conserva.
    const expenseId = invoice.expenseOwned ? invoice.expenseId : null;
    await this.repo.remove(invoice);
    // El archivo y el gasto se borran DESPUÉS y sin propagar: el dato contable es la factura.
    if (photo) this.unlinkStored(photo);
    // El gasto nació de esta factura: sin ella no tiene sentido y quedaría huérfano en Gastos.
    if (expenseId) {
      try {
        await this.expenses.remove(expenseId, requesterId);
      } catch (err) {
        this.logger.error(`No se pudo borrar el gasto ${expenseId} de la factura ${id}: ${(err as Error).message}`);
      }
    }
  }

  /** Guarda la foto subida (multer ya la dejó en disco). Reemplaza la anterior. */
  async attachPhoto(id: string, file: Express.Multer.File): Promise<FiscalInvoice> {
    const invoice = await this.findOne(id);

    if (!validateFileMagicBytes(file.path, file.mimetype)) {
      unlink(file.path, () => undefined);
      throw new BadRequestException(
        'El contenido del archivo no coincide con su tipo. Se aceptan PDF, JPG, PNG y WEBP.',
      );
    }

    const previous = invoice.photoPath;
    await this.repo.update(id, {
      photoPath: relative(getUploadRoot(), file.path),
      photoMimetype: file.mimetype,
    });
    if (previous) this.unlinkStored(previous);
    return this.findOne(id);
  }

  /** Ruta absoluta y tipo de la foto, para la descarga. */
  async getPhoto(id: string): Promise<{ absolutePath: string; mimetype: string; filename: string }> {
    const invoice = await this.findOne(id);
    if (!invoice.photoPath) throw new NotFoundException('Esta factura no tiene foto');
    const absolutePath = join(getUploadRoot(), invoice.photoPath);
    if (!existsSync(absolutePath)) throw new NotFoundException('El archivo de la foto no está en el servidor');
    return {
      absolutePath,
      mimetype: invoice.photoMimetype ?? 'application/octet-stream',
      filename: `${invoice.ncf}${invoice.photoPath.slice(invoice.photoPath.lastIndexOf('.'))}`,
    };
  }

  /**
   * Consulta la factura en la DGII y guarda el resultado (ERP-37). El comprador es la
   * propia empresa (RNC de Configuración). Un e-CF pide además el código de seguridad:
   * sin él la DGII responde "falta un dato" y no se toca lo guardado. Tampoco se guarda
   * una respuesta que no se pudo interpretar.
   */
  async validateWithDgii(
    id: string,
    codigoSeguridad?: string,
  ): Promise<{ invoice: FiscalInvoice; result: ComprobanteResult }> {
    const invoice = await this.findOne(id);
    const code = codigoSeguridad?.trim() || invoice.securityCode || undefined;
    const company = await this.settings.getCompanyData();

    const result = await this.dgii.checkComprobante({
      rnc: invoice.supplierRnc,
      ncf: invoice.ncf,
      rncComprador: normalizeRnc(company.rnc ?? ''),
      codigoSeguridad: code,
    });

    const patch: Partial<Pick<FiscalInvoice, 'dgiiEstado' | 'dgiiValidatedAt' | 'securityCode'>> = {};
    if (codigoSeguridad?.trim() && code !== invoice.securityCode) patch.securityCode = code;
    if (result.estado && result.verdict !== 'needs-data' && result.verdict !== 'unknown') {
      patch.dgiiEstado = result.estado;
      patch.dgiiValidatedAt = new Date();
    }
    if (Object.keys(patch).length > 0) await this.repo.update(id, patch);

    return { invoice: await this.findOne(id), result };
  }

  /**
   * Consulta en la DGII una tanda de facturas que nunca se han consultado (ERP-37). Va
   * una por una con una pausa; una que falle o no se pueda interpretar no frena a las
   * demás. Los e-NCF sin código de seguridad no se pueden confirmar y se reportan aparte.
   */
  async validatePending(limit = 15, exclude: string[] = []) {
    const qb = this.repo
      .createQueryBuilder('inv')
      .where('inv.dgiiEstado IS NULL')
      .orderBy('inv.invoiceDate', 'DESC');
    if (exclude.length) qb.andWhere('inv.id NOT IN (:...exclude)', { exclude });
    const total = await qb.getCount();
    const batch = await qb.take(limit).getMany();

    const outcome = {
      checked: 0,
      validated: 0,
      unresolved: [] as { id: string; ncf: string; reason: string }[],
    };
    for (const inv of batch) {
      outcome.checked += 1;
      if (inv.ncf.startsWith('E') && !inv.securityCode) {
        outcome.unresolved.push({ id: inv.id, ncf: inv.ncf, reason: 'e-NCF sin código de seguridad' });
        continue;
      }
      try {
        const { invoice, result } = await this.validateWithDgii(inv.id);
        if (invoice.dgiiEstado) outcome.validated += 1;
        else outcome.unresolved.push({ id: inv.id, ncf: inv.ncf, reason: result.message || 'Sin resultado' });
      } catch (err) {
        outcome.unresolved.push({
          id: inv.id,
          ncf: inv.ncf,
          reason: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
      await new Promise((r) => setTimeout(r, DGII_PAUSE_MS));
    }
    return { ...outcome, pendingBefore: total, remaining: Math.max(0, total - outcome.validated) };
  }

  private typeOrFail(ncf: string): string {
    const type = ncfTypeOf(ncf);
    if (!type) throw new BadRequestException(`NCF no válido: ${ncf}`);
    return type;
  }

  private async assertNotDuplicate(rnc: string, ncf: string, exceptId?: string): Promise<void> {
    const existing = await this.repo.findOne({
      where: { supplierRnc: rnc, ncf },
      select: { id: true, invoiceDate: true, supplierName: true },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(
        `Ya está registrada la factura ${ncf} de ${existing.supplierName} (${existing.invoiceDate}).`,
      );
    }
  }

  private unlinkStored(relativePath: string): void {
    const absPath = join(getUploadRoot(), relativePath);
    if (!existsSync(absPath)) return;
    unlink(absPath, () => undefined);
  }
}
