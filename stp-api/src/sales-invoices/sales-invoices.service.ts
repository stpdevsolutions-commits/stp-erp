import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { SalesInvoice, SalesInvoiceKind, SalesInvoiceStatus } from './entities/sales-invoice.entity';
import { SalesInvoiceLine } from './entities/sales-invoice-line.entity';
import {
  AddInvoicePaymentDto,
  CreateCreditNoteDto,
  CreateSalesInvoiceDto,
  QuerySalesInvoicesDto,
  SalesInvoiceLineDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';
import {
  indicadorFacturacion,
  invoiceTotals,
  lineAmounts,
  quoteToLines,
  round2,
  tipoEcfFor,
  type DraftLine,
} from './sales-invoice-rules';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote, QuoteStatus } from '../quotes/entities/quote.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../payments/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { CreatePaymentDto } from '../payments/dto/create-payment.dto';
import { EcfClientService } from '../ecf/ecf-client.service';
import { SettingsService } from '../settings/settings.service';
import { generateSalesInvoicePdf } from './pdf.generator';
import type { EcfPrintInfo } from './ecf-representation.generator';
import { auditLog } from '../common/audit-log';
import { todayRD } from '../common/dates';

/** Cobros ya aplicados a la factura (solo los completados cuentan como cobrado). */
const PAID_SQL = `COALESCE((SELECT SUM(p."amount") FROM "payments" p WHERE p."salesInvoiceId" = inv."id" AND p."status" = 'completed'), 0)`;

/** Notas de crédito ya emitidas contra la factura. */
const CREDIT_SQL = `COALESCE((SELECT SUM(c."total") FROM "sales_invoices" c WHERE c."relatedInvoiceId" = inv."id" AND c."status" = 'issued'), 0)`;

/** Lo que vale la factura después de sus notas de crédito. */
const NET_SQL = `(inv."total" - ${CREDIT_SQL})`;

/** Tolerancia de centavos al comparar saldos. */
const EPS = 0.005;

/** La DGII/ecf-api devuelve "0" cuando aún no hay código (p. ej. un rechazo): se trata como vacío. */
const codigoSeguridad = (v?: string | null): string | null => {
  const t = (v ?? '').trim();
  return t && t !== '0' ? t : null;
};

@Injectable()
export class SalesInvoicesService {
  private readonly logger = new Logger(SalesInvoicesService.name);

  constructor(
    @InjectRepository(SalesInvoice) private readonly repo: Repository<SalesInvoice>,
    @InjectRepository(SalesInvoiceLine) private readonly lineRepo: Repository<SalesInvoiceLine>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Quote) private readonly quotes: Repository<Quote>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly paymentsService: PaymentsService,
    private readonly ecf: EcfClientService,
    private readonly settings: SettingsService,
  ) {}

  // ── Lectura ────────────────────────────────────────────────────────────────

  private filtered(query: QuerySalesInvoicesDto): SelectQueryBuilder<SalesInvoice> {
    const { search, clientId, projectId, quoteId, status, payment, ecfEstado, dateFrom, dateTo, kind } = query;
    const qb = this.repo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .leftJoinAndSelect('inv.project', 'project')
      .leftJoinAndSelect('inv.quote', 'quote')
      .leftJoinAndSelect('inv.relatedInvoice', 'related');

    if (search) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('inv.number ILIKE :term', { term })
            .orWhere('inv.ecfEncf ILIKE :term', { term })
            .orWhere('client.name ILIKE :term', { term })
            .orWhere('client.rnc ILIKE :term', { term }),
        ),
      );
    }
    if (clientId) qb.andWhere('inv.clientId = :clientId', { clientId });
    if (projectId) qb.andWhere('inv.projectId = :projectId', { projectId });
    if (quoteId) qb.andWhere('inv.quoteId = :quoteId', { quoteId });
    if (status) qb.andWhere('inv.status = :status', { status });
    if (kind) qb.andWhere('inv.kind = :kind', { kind });
    if (ecfEstado) qb.andWhere('inv.ecfEstado = :ecfEstado', { ecfEstado });
    if (dateFrom) qb.andWhere('inv.issueDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('inv.issueDate <= :dateTo', { dateTo });
    if (payment) {
      // El estado de cobro solo existe en facturas emitidas (no en notas de crédito).
      qb.andWhere(`inv.status = 'issued' AND inv.kind = 'invoice'`);
      if (payment === 'void') qb.andWhere(`${CREDIT_SQL} > :eps AND ${NET_SQL} < :eps`, { eps: EPS });
      if (payment === 'unpaid') qb.andWhere(`${NET_SQL} >= :eps AND ${PAID_SQL} < :eps`, { eps: EPS });
      if (payment === 'partial') {
        qb.andWhere(`${PAID_SQL} >= :eps AND ${PAID_SQL} < ${NET_SQL} - :eps`, { eps: EPS });
      }
      if (payment === 'paid') qb.andWhere(`${NET_SQL} >= :eps AND ${PAID_SQL} >= ${NET_SQL} - :eps`, { eps: EPS });
      if (payment === 'overdue') {
        qb.andWhere(`inv.dueDate IS NOT NULL AND inv.dueDate < :today AND ${PAID_SQL} < ${NET_SQL} - :eps`, {
          today: todayRD(),
          eps: EPS,
        });
      }
    }
    return qb;
  }

  private async attachPaid(invoices: SalesInvoice[]): Promise<void> {
    if (invoices.length === 0) return;
    const ids = invoices.map((i) => i.id);
    const rows = await this.payments
      .createQueryBuilder('p')
      .select('p."salesInvoiceId"', 'id')
      .addSelect('COALESCE(SUM(p."amount"), 0)', 'sum')
      .where('p."salesInvoiceId" IN (:...ids)', { ids })
      .andWhere(`p."status" = 'completed'`)
      .groupBy('p."salesInvoiceId"')
      .getRawMany<{ id: string; sum: string }>();
    const paid = new Map(rows.map((r) => [r.id, parseFloat(r.sum)]));
    const creditRows = await this.repo
      .createQueryBuilder('c')
      .select('c."relatedInvoiceId"', 'id')
      .addSelect('COALESCE(SUM(c."total"), 0)', 'sum')
      .where('c."relatedInvoiceId" IN (:...ids)', { ids })
      .andWhere(`c."status" = 'issued'`)
      .groupBy('c."relatedInvoiceId"')
      .getRawMany<{ id: string; sum: string }>();
    const credited = new Map(creditRows.map((r) => [r.id, parseFloat(r.sum)]));
    const today = todayRD();
    for (const inv of invoices) {
      const p = round2(paid.get(inv.id) ?? 0);
      const cr = round2(credited.get(inv.id) ?? 0);
      inv.paidAmount = p;
      inv.creditedAmount = cr;
      inv.netTotal = round2(inv.total - cr);
      inv.balance = round2(inv.netTotal - p);
      if (inv.status !== SalesInvoiceStatus.ISSUED || inv.kind === SalesInvoiceKind.CREDIT_NOTE) {
        inv.paymentStatus = null;
        inv.overdue = false;
      } else if (cr > EPS && inv.netTotal < EPS) {
        inv.paymentStatus = 'void';
        inv.overdue = false;
      } else {
        inv.paymentStatus = p >= inv.netTotal - EPS ? 'paid' : p >= EPS ? 'partial' : 'unpaid';
        inv.overdue = inv.paymentStatus !== 'paid' && !!inv.dueDate && inv.dueDate < today;
      }
    }
  }

  async findAll(query: QuerySalesInvoicesDto) {
    const { page = 1, limit = 20 } = query;
    const qb = this.filtered(query)
      .orderBy('inv.issueDate', 'DESC')
      .addOrderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Totales de TODO lo filtrado (no solo la página); solo cuentan las emitidas.
    const sumQb = this.filtered(query)
      // Facturado = facturas emitidas menos sus notas de crédito emitidas.
      .select(
        `COALESCE(SUM(CASE WHEN inv.status = 'issued' THEN (CASE WHEN inv.kind = 'credit_note' THEN -inv.total ELSE inv.total END) ELSE 0 END), 0)`,
        'invoiced',
      )
      .addSelect(
      `COALESCE(SUM(CASE WHEN inv.status = 'issued' AND inv.kind = 'invoice' THEN ${PAID_SQL} ELSE 0 END), 0)`,
      'collected',
    )
      // Por cobrar = lo que falta por factura (nunca negativo: un cobro de más no resta de otra).
      .addSelect(
        `COALESCE(SUM(CASE WHEN inv.status = 'issued' AND inv.kind = 'invoice' THEN GREATEST(${NET_SQL} - ${PAID_SQL}, 0) ELSE 0 END), 0)`,
        'receivable',
      );

    const [[data, total], sums] = await Promise.all([
      qb.getManyAndCount(),
      sumQb.getRawOne<{ invoiced: string; collected: string; receivable: string }>(),
    ]);
    await this.attachPaid(data);
    const invoiced = parseFloat(sums?.invoiced ?? '0');
    const collected = parseFloat(sums?.collected ?? '0');
    return {
      data,
      total,
      page,
      limit,
      summary: { invoiced, collected, receivable: parseFloat(sums?.receivable ?? '0') },
    };
  }

  async findOne(id: string): Promise<SalesInvoice> {
    const invoice = await this.repo.findOne({
      where: { id },
      relations: { client: true, project: true, quote: true, lines: true, relatedInvoice: true },
      order: { lines: { position: 'ASC' } },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    await this.attachPaid([invoice]);
    return invoice;
  }

  /** PDF (representación impresa) de la factura, generado al vuelo. */
  async pdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.findOne(id);
    const company = await this.settings.getCompanyData();
    const buffer = await generateSalesInvoicePdf(inv, company, await this.ecfPrintInfo(inv));
    return { buffer, filename: `${inv.ecfEncf ?? inv.number}.pdf` };
  }

  /**
   * Fecha de firma y vencimiento de la secuencia, que la representación impresa debe mostrar y
   * que solo están en el XML firmado de ecf-api. Si ecf-api no responde, el PDF sale sin ellos.
   */
  private async ecfPrintInfo(inv: SalesInvoice): Promise<EcfPrintInfo> {
    if (inv.status !== SalesInvoiceStatus.ISSUED || !inv.ecfId) return {};
    try {
      const r = await this.ecf.obtener(inv.ecfId);
      const xml = typeof r.xmlFirmado === 'string' ? r.xmlFirmado : '';
      const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() || null;
      return { fechaFirma: tag('FechaHoraFirma'), fechaVencimiento: tag('FechaVencimientoSecuencia') };
    } catch {
      return {};
    }
  }

  /** Cobros aplicados a la factura. */
  async listPayments(id: string): Promise<Payment[]> {
    await this.findOne(id);
    return this.payments.find({ where: { salesInvoiceId: id }, order: { date: 'ASC', createdAt: 'ASC' } });
  }

  /** Cobros del cliente que todavía no se aplicaron a ninguna factura. */
  async availablePayments(id: string): Promise<Payment[]> {
    const inv = await this.findOne(id);
    return this.payments
      .createQueryBuilder('p')
      .where('p.clientId = :clientId', { clientId: inv.clientId })
      .andWhere('p.salesInvoiceId IS NULL')
      .andWhere('p.status = :st', { st: PaymentStatus.COMPLETED })
      .orderBy('p.date', 'DESC')
      .take(100)
      .getMany();
  }

  // ── Cotización → factura ───────────────────────────────────────────────────

  private async loadQuote(quoteId: string): Promise<Quote> {
    const quote = await this.quotes.findOne({
      where: { id: quoteId },
      relations: { items: true, project: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    if (quote.supersededById) {
      throw new ConflictException('Esa cotización fue reemplazada por una revisión posterior; factura la vigente.');
    }
    if (quote.status !== QuoteStatus.APPROVED) {
      throw new ConflictException('Solo se pueden facturar cotizaciones aprobadas.');
    }
    return quote;
  }

  /** Lo ya facturado de una cotización (borradores incluidos, menos notas de crédito emitidas), sin contar `exceptId`. */
  private async invoicedOfQuote(quoteId: string, exceptId?: string): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('inv')
      .select(
        `COALESCE(SUM(CASE WHEN inv.kind = 'credit_note' THEN (CASE WHEN inv.status = 'issued' THEN -inv.total ELSE 0 END) ELSE inv.total END), 0)`,
        'sum',
      )
      .where('inv.quoteId = :quoteId', { quoteId });
    if (exceptId) qb.andWhere('inv.id != :exceptId', { exceptId });
    const row = await qb.getRawOne<{ sum: string }>();
    return parseFloat(row?.sum ?? '0');
  }

  /** Vista previa de la factura que saldría de una cotización. No guarda nada. */
  async previewFromQuote(quoteId: string, percent = 100) {
    const quote = await this.loadQuote(quoteId);
    const { lines, warnings } = quoteToLines(
      {
        subtotal: quote.subtotal,
        discount: quote.discount,
        taxRate: quote.taxRate,
        total: quote.total,
        indirectCosts: quote.indirectCosts,
        items: quote.items.map((i) => ({
          id: i.id,
          parentId: i.parentId ?? null,
          kind: i.kind,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit ?? null,
          total: i.total,
          sortOrder: i.sortOrder,
        })),
      },
      percent,
    );
    const invoiced = await this.invoicedOfQuote(quoteId);
    return {
      quote: {
        id: quote.id,
        number: quote.number,
        title: quote.title,
        clientId: quote.clientId,
        projectId: quote.projectId ?? null,
        total: quote.total,
      },
      percent,
      lines,
      totals: invoiceTotals(lines),
      alreadyInvoiced: round2(invoiced),
      remaining: round2(Math.max(0, quote.total - invoiced)),
      warnings,
    };
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  private async nextNumber(kind: SalesInvoiceKind = SalesInvoiceKind.INVOICE): Promise<string> {
    const year = todayRD().slice(0, 4);
    const prefix = `${kind === SalesInvoiceKind.CREDIT_NOTE ? 'NC' : 'FAC'}-${year}-`;
    const last = await this.repo
      .createQueryBuilder('inv')
      .select('inv.number', 'number')
      .where('inv.number LIKE :p', { p: `${prefix}%` })
      .orderBy('inv.number', 'DESC')
      .limit(1)
      .getRawOne<{ number: string }>();
    const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(n).padStart(3, '0')}`;
  }

  private toLineEntities(lines: SalesInvoiceLineDto[] | DraftLine[]): SalesInvoiceLine[] {
    return lines.map((l, i) => {
      const a = lineAmounts(l);
      return this.lineRepo.create({
        position: i,
        description: l.description.trim(),
        quantity: l.quantity,
        unit: l.unit ?? null,
        unitPrice: l.unitPrice,
        itbisRate: l.itbisRate,
        goodOrService: l.goodOrService ?? 2,
        total: a.total,
        itbisAmount: a.itbisAmount,
      });
    });
  }

  async create(dto: CreateSalesInvoiceDto, userId: string): Promise<SalesInvoice> {
    const client = await this.clients.findOne({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    let projectId = dto.projectId ?? null;
    let lines: SalesInvoiceLineDto[] | DraftLine[] | undefined = dto.lines;
    let quotePercent: number | null = null;
    let notes = dto.notes ?? null;

    if (dto.quoteId) {
      const quote = await this.loadQuote(dto.quoteId);
      if (quote.clientId !== dto.clientId) {
        throw new BadRequestException('La cotización no es de ese cliente.');
      }
      quotePercent = dto.quotePercent ?? 100;
      projectId = projectId ?? quote.projectId ?? null;
      if (!lines) {
        const prev = await this.previewFromQuote(dto.quoteId, quotePercent);
        lines = prev.lines;
      }
      if (!notes) {
        notes =
          quotePercent >= 100
            ? `Cotización ${quote.number}: ${quote.title}`
            : `Avance del ${quotePercent}% de la cotización ${quote.number}: ${quote.title}`;
      }
    }
    if (!lines || lines.length === 0) {
      throw new BadRequestException('La factura necesita al menos una línea (o una cotización de origen).');
    }
    if (projectId) {
      const project = await this.projects.findOne({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      if (project.clientId && project.clientId !== dto.clientId) {
        throw new BadRequestException('El proyecto no es de ese cliente.');
      }
    }

    const totals = invoiceTotals(lines);
    if (totals.total <= 0) throw new BadRequestException('El total de la factura debe ser mayor que cero.');
    if (dto.quoteId) await this.assertWithinQuote(dto.quoteId, totals.total);

    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await this.repo.save(
          this.repo.create({
            number: await this.nextNumber(),
            clientId: dto.clientId,
            projectId,
            quoteId: dto.quoteId ?? null,
            quotePercent,
            issueDate: dto.issueDate ?? todayRD(),
            dueDate: dto.dueDate ?? null,
            notes,
            status: SalesInvoiceStatus.DRAFT,
            ...totals,
            createdById: userId,
            lines: this.toLineEntities(lines),
          }),
        );
        auditLog(userId, 'sales-invoice.created', { id: saved.id, number: saved.number, total: totals.total });
        return this.findOne(saved.id);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '23505' && attempt < 3) continue; // otro usuario tomó el mismo número
        throw err;
      }
    }
  }

  /** No dejar facturar más de lo cotizado (con un peso de margen por redondeos). */
  private async assertWithinQuote(quoteId: string, newTotal: number, exceptId?: string): Promise<void> {
    const quote = await this.quotes.findOne({ where: { id: quoteId }, select: { id: true, total: true, number: true } });
    if (!quote) return;
    const already = await this.invoicedOfQuote(quoteId, exceptId);
    if (already + newTotal > quote.total + 1) {
      throw new ConflictException(
        `Esta factura supera lo cotizado: la cotización ${quote.number} es de ${quote.total.toFixed(2)} y ya hay ${already.toFixed(2)} facturado.`,
      );
    }
  }

  async update(id: string, dto: UpdateSalesInvoiceDto, userId: string): Promise<SalesInvoice> {
    const inv = await this.findOne(id);
    if (inv.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException('Solo se puede editar una factura en borrador.');
    }
    if (dto.projectId) {
      const project = await this.projects.findOne({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      if (project.clientId && project.clientId !== inv.clientId) {
        throw new BadRequestException('El proyecto no es de ese cliente.');
      }
    }
    const patch: Partial<SalesInvoice> = {};
    if (dto.projectId !== undefined) patch.projectId = dto.projectId;
    if (dto.issueDate !== undefined) patch.issueDate = dto.issueDate;
    if (dto.dueDate !== undefined) patch.dueDate = dto.dueDate;
    if (dto.notes !== undefined) patch.notes = dto.notes;

    if (dto.lines) {
      const totals = invoiceTotals(dto.lines);
      if (totals.total <= 0) throw new BadRequestException('El total de la factura debe ser mayor que cero.');
      if (inv.quoteId && inv.kind === SalesInvoiceKind.INVOICE) {
        await this.assertWithinQuote(inv.quoteId, totals.total, id);
      }
      await this.lineRepo.delete({ invoiceId: id });
      await this.lineRepo.save(this.toLineEntities(dto.lines).map((l) => ({ ...l, invoiceId: id })));
      Object.assign(patch, totals);
    }
    if (Object.keys(patch).length > 0) await this.repo.update(id, patch as never);
    auditLog(userId, 'sales-invoice.updated', { id, number: inv.number });
    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const inv = await this.findOne(id);
    if (inv.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException(
        'Una factura emitida no se puede borrar: se corrige con una nota de crédito.',
      );
    }
    await this.repo.delete(id);
    auditLog(userId, 'sales-invoice.deleted', { id, number: inv.number, total: inv.total });
  }

  // ── e-CF ───────────────────────────────────────────────────────────────────

  /** Arma el comprobante que se manda a ecf-api (factura 31/32 o nota de crédito 34). */
  private buildEcfDto(inv: SalesInvoice) {
    const isCreditNote = inv.kind === SalesInvoiceKind.CREDIT_NOTE;
    const { tipoEcf: tipoVenta, rnc } = tipoEcfFor(inv.client.rnc);
    const hoy = todayRD();
    // Crédito: la factura tiene una fecha límite de cobro futura.
    const credito = !isCreditNote && !!inv.dueDate && inv.dueDate > hoy;
    const dias = credito ? Math.max(1, Math.round((Date.parse(inv.dueDate!) - Date.parse(hoy)) / 86_400_000)) : 0;
    return {
      tipoEcf: isCreditNote ? 'e-CF_34_v_1_0' : tipoVenta,
      tipoPago: credito ? 2 : 1,
      // XSD TerminoPago: letras, números y espacios, hasta 15 caracteres.
      terminoPago: credito ? `${dias} dias` : undefined,
      fechaLimitePago: credito ? inv.dueDate! : undefined,
      rncComprador: rnc,
      nombreComprador: inv.client.name || 'Consumidor Final',
      correoComprador: inv.client.email || undefined,
      comentarioComprador: inv.notes ? inv.notes.slice(0, 250) : undefined,
      referencia:
        isCreditNote && inv.relatedInvoice
          ? {
              ncfModificado: inv.relatedInvoice.ecfEncf!,
              fechaNcfModificado: inv.relatedInvoice.issueDate,
              codigoModificacion: inv.modificationCode ?? 3,
              razonModificacion: inv.reason ?? undefined,
            }
          : undefined,
      lineas: inv.lines.map((l) => ({
        descripcion: l.description,
        cantidad: l.quantity,
        precioUnitario: l.unitPrice,
        indicadorFacturacion: indicadorFacturacion(l.itbisRate),
        indicadorBienoServicio: l.goodOrService,
      })),
    };
  }

  async emit(id: string, opts: { transmitir?: boolean }, userId: string): Promise<SalesInvoice> {
    const inv = await this.findOne(id);
    if (inv.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException(
        inv.ecfEncf ? `Este documento ya tiene comprobante (${inv.ecfEncf}).` : 'El documento no está en borrador.',
      );
    }
    if (inv.lines.length === 0 || inv.total <= 0) {
      throw new BadRequestException('El documento no tiene líneas con monto.');
    }
    if (inv.kind === SalesInvoiceKind.CREDIT_NOTE) {
      if (inv.relatedInvoice?.status !== SalesInvoiceStatus.ISSUED || !inv.relatedInvoice.ecfEncf) {
        throw new ConflictException('La factura que modifica esta nota de crédito no tiene comprobante emitido.');
      }
    }

    // Reserva atómica: dos clics (o dos usuarios) no pueden emitir el mismo documento dos veces.
    const claim = await this.repo
      .createQueryBuilder()
      .update(SalesInvoice)
      .set({ status: SalesInvoiceStatus.EMITTING })
      .where('id = :id AND status = :st', { id, st: SalesInvoiceStatus.DRAFT })
      .execute();
    if (claim.affected !== 1) throw new ConflictException('El documento ya se está emitiendo.');

    const dto = this.buildEcfDto(inv);
    let r;
    try {
      // Siempre se crea, valida y firma; el envío a la DGII va aparte para que, si falla, el
      // comprobante ya emitido (con su e-NCF) no se pierda y se pueda reintentar.
      r = await this.ecf.emitir(dto, { transmitir: false });
    } catch (e) {
      const message = String((e as Error)?.message ?? e).slice(0, 1000);
      await this.repo.update(id, { status: SalesInvoiceStatus.DRAFT, ecfError: message });
      throw e;
    }
    await this.repo.update(id, {
      status: SalesInvoiceStatus.ISSUED,
      issueDate: todayRD(),
      ecfId: r.id,
      ecfEncf: r.encf ?? null,
      ecfTipo: dto.tipoEcf,
      ecfUuid: r.uuid ?? null,
      ecfEstado: r.estado ?? null,
      ecfCodigoSeguridad: codigoSeguridad(r.codigoSeguridadDgii),
      ecfQrUrl: r.qrUrl ?? null,
      ecfError: null,
      ecfMensaje: null,
      ecfEmitidoAt: new Date(),
    });
    auditLog(userId, 'sales-invoice.emitted', { id, number: inv.number, encf: r.encf, total: inv.total, kind: inv.kind });
    this.logger.log(`e-CF emitido para ${inv.number}: ${r.encf} (${r.estado})`);

    if (opts.transmitir) await this.tryTransmit(id, r.id);
    return this.findOne(id);
  }

  /** Transmite sin lanzar: un fallo se guarda en `ecfError` y el comprobante queda emitido (firmado). */
  private async tryTransmit(id: string, ecfId: string): Promise<void> {
    try {
      await this.ecf.transmitir(ecfId);
      await this.repo.update(id, { ecfError: null });
      await this.syncEcf(id);
    } catch (e) {
      await this.repo.update(id, { ecfError: String((e as Error)?.message ?? e).slice(0, 1000) });
    }
  }

  /**
   * Lee el e-CF en ecf-api y guarda su estado. Solo uno ya transmitido se consulta a la
   * DGII (antes, ecf-api responde 400); de esa consulta sale el mensaje (p. ej. el motivo
   * de un rechazo). La DGII puede tardar unos segundos en responder.
   */
  private async syncEcf(id: string): Promise<void> {
    const inv = await this.repo.findOne({ where: { id } });
    if (!inv?.ecfId) return;
    let r = await this.ecf.obtener(inv.ecfId);
    let mensaje: string | null | undefined;
    if (r.estado === 'transmitted') {
      try {
        const st = await this.ecf.estado(inv.ecfId);
        mensaje = typeof st.mensaje === 'string' ? st.mensaje.trim() : null;
        r = await this.ecf.obtener(inv.ecfId);
      } catch {
        // la DGII aún no responde: se deja como está
      }
    }
    await this.repo.update(id, {
      ecfEstado: r.estado ?? inv.ecfEstado,
      ecfCodigoSeguridad: codigoSeguridad(r.codigoSeguridadDgii) ?? inv.ecfCodigoSeguridad,
      ecfQrUrl: r.qrUrl ?? inv.ecfQrUrl,
      ...(mensaje !== undefined ? { ecfMensaje: mensaje } : {}),
    });
  }

  /** Vuelve a leer el estado del e-CF (y lo consulta a la DGII si ya se transmitió). */
  async refreshEcf(id: string): Promise<SalesInvoice> {
    const inv = await this.findOne(id);
    if (!inv.ecfId) throw new ConflictException('El documento todavía no tiene comprobante.');
    await this.syncEcf(id);
    return this.findOne(id);
  }

  /** Envía a la DGII un comprobante que se emitió sin transmitir. */
  async transmit(id: string, userId: string): Promise<SalesInvoice> {
    const inv = await this.findOne(id);
    if (inv.status !== SalesInvoiceStatus.ISSUED || !inv.ecfId) {
      throw new ConflictException('El documento todavía no tiene comprobante.');
    }
    if (inv.ecfEstado && inv.ecfEstado !== 'signed' && inv.ecfEstado !== 'validated') {
      throw new ConflictException(`El comprobante ya fue enviado (estado: ${inv.ecfEstado}).`);
    }
    try {
      await this.ecf.transmitir(inv.ecfId);
    } catch (e) {
      await this.repo.update(id, { ecfError: String((e as Error)?.message ?? e).slice(0, 1000) });
      throw e;
    }
    await this.repo.update(id, { ecfError: null });
    auditLog(userId, 'sales-invoice.transmitted', { id, number: inv.number, encf: inv.ecfEncf });
    await this.syncEcf(id);
    return this.findOne(id);
  }

  // ── Notas de crédito ───────────────────────────────────────────────────────

  /**
   * Crea (en borrador) una nota de crédito contra una factura emitida: `full` la anula
   * entera (código 1) y `partial` acredita un monto (código 3, corrige montos). Se emite
   * después, como cualquier documento. No se puede acreditar más de lo facturado.
   */
  async createCreditNote(id: string, dto: CreateCreditNoteDto, userId: string): Promise<SalesInvoice> {
    const orig = await this.findOne(id);
    if (orig.kind !== SalesInvoiceKind.INVOICE || orig.status !== SalesInvoiceStatus.ISSUED || !orig.ecfEncf) {
      throw new ConflictException('Solo se puede crear una nota de crédito sobre una factura con comprobante emitido.');
    }
    const prevRow = await this.repo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.total), 0)', 'sum')
      .where('c.relatedInvoiceId = :id', { id })
      .getRawOne<{ sum: string }>();
    const previous = parseFloat(prevRow?.sum ?? '0');
    const remaining = round2(orig.total - previous);
    if (remaining <= EPS) throw new ConflictException('La factura ya está acreditada por completo.');

    let lines: DraftLine[];
    let code: number;
    if (dto.mode === 'full') {
      if (previous > EPS) {
        throw new ConflictException('La factura ya tiene notas de crédito: usa un crédito parcial por el saldo.');
      }
      lines = orig.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        itbisRate: l.itbisRate,
        goodOrService: l.goodOrService,
      }));
      code = 1;
    } else {
      if (!dto.amount) throw new BadRequestException('Indica el monto a acreditar.');
      lines = [
        {
          description: `Ajuste: ${dto.reason}`.slice(0, 500),
          quantity: 1,
          unit: null,
          unitPrice: dto.amount,
          itbisRate: dto.itbisRate ?? 18,
          goodOrService: 2,
        },
      ];
      code = 3;
    }
    const totals = invoiceTotals(lines);
    if (totals.total > remaining + 0.01) {
      throw new ConflictException(
        `La nota de crédito (${totals.total.toFixed(2)}) supera lo que queda por acreditar de la factura (${remaining.toFixed(2)}).`,
      );
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await this.repo.save(
          this.repo.create({
            number: await this.nextNumber(SalesInvoiceKind.CREDIT_NOTE),
            kind: SalesInvoiceKind.CREDIT_NOTE,
            clientId: orig.clientId,
            projectId: orig.projectId,
            quoteId: orig.quoteId,
            relatedInvoiceId: orig.id,
            modificationCode: code,
            reason: dto.reason,
            issueDate: todayRD(),
            notes: `Nota de crédito de ${orig.ecfEncf}: ${dto.reason}`,
            status: SalesInvoiceStatus.DRAFT,
            ...totals,
            createdById: userId,
            lines: this.toLineEntities(lines),
          }),
        );
        auditLog(userId, 'sales-invoice.credit-note-created', { id: saved.id, number: saved.number, of: orig.number, total: totals.total, code });
        return this.findOne(saved.id);
      } catch (err) {
        if ((err as { code?: string }).code === '23505' && attempt < 3) continue;
        throw err;
      }
    }
  }

  // ── Cobros ─────────────────────────────────────────────────────────────────

  private assertCapacity(inv: SalesInvoice, amount: number): void {
    if (inv.kind === SalesInvoiceKind.CREDIT_NOTE) {
      throw new ConflictException('Una nota de crédito no recibe cobros.');
    }
    if (inv.status !== SalesInvoiceStatus.ISSUED) {
      throw new ConflictException('Solo se aplican cobros a una factura emitida.');
    }
    const balance = inv.balance ?? inv.total;
    if (amount > balance + 0.01) {
      throw new ConflictException(
        `El cobro (${amount.toFixed(2)}) supera el saldo de la factura (${balance.toFixed(2)}).`,
      );
    }
  }

  /** Registra un cobro nuevo ya aplicado a esta factura. */
  async addPayment(id: string, dto: AddInvoicePaymentDto, userId: string): Promise<SalesInvoice> {
    const inv = await this.findOne(id);
    this.assertCapacity(inv, dto.amount);
    const payment = await this.paymentsService.create(
      {
        clientId: inv.clientId,
        projectId: inv.projectId ?? undefined,
        quoteId: inv.quoteId ?? undefined,
        description: `Cobro factura ${inv.ecfEncf ?? inv.number}`,
        amount: dto.amount,
        method: dto.method ?? PaymentMethod.TRANSFER,
        status: PaymentStatus.COMPLETED,
        date: dto.date,
        reference: dto.reference,
        notes: dto.notes,
      } as CreatePaymentDto,
      userId,
    );
    await this.payments.update(payment.id, { salesInvoiceId: id });
    auditLog(userId, 'sales-invoice.payment-added', { id, paymentId: payment.id, amount: dto.amount });
    return this.findOne(id);
  }

  /** Aplica a esta factura un cobro que ya estaba registrado en Pagos. */
  async applyPayment(id: string, paymentId: string, userId: string): Promise<SalesInvoice> {
    const inv = await this.findOne(id);
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Cobro no encontrado');
    if (payment.clientId !== inv.clientId) throw new BadRequestException('El cobro es de otro cliente.');
    if (payment.salesInvoiceId) throw new ConflictException('Ese cobro ya está aplicado a una factura.');
    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new ConflictException('Solo se aplican cobros completados.');
    }
    this.assertCapacity(inv, payment.amount);
    await this.payments.update(paymentId, { salesInvoiceId: id });
    auditLog(userId, 'sales-invoice.payment-applied', { id, paymentId, amount: payment.amount });
    return this.findOne(id);
  }

  /** Suelta un cobro de la factura (el cobro sigue existiendo en Pagos). */
  async unlinkPayment(id: string, paymentId: string, userId: string): Promise<SalesInvoice> {
    const res = await this.payments.update({ id: paymentId, salesInvoiceId: id }, { salesInvoiceId: null });
    if (!res.affected) throw new NotFoundException('Ese cobro no está aplicado a esta factura.');
    auditLog(userId, 'sales-invoice.payment-unlinked', { id, paymentId });
    return this.findOne(id);
  }
}
