import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { RefreshAcuPricesDto } from './dto/refresh-acu-prices.dto';
import { rowsToTree, flattenTree, ancestorPath } from './quote-tree';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { UserRole } from '../users/entities/user.entity';
import type { Quote } from './entities/quote.entity';
import {
  addReportSheet,
  createWorkbook,
  dateOnly,
  localDateOnly,
  localDateTime,
  sendWorkbook,
  type ReportColumn,
  type ReportFilter,
} from '../common/excel-report';

interface AuthUser { id: string; role: UserRole; }

const QUOTE_STATUS_ES: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

/** Fila aplanada de la hoja "Detalle de ítems". */
interface QuoteItemRow {
  quoteNumber: string;
  clientName: string;
  sectionName: string;
  numbering: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  total: number;
}

@Controller('quotes')
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryQuotesDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.findAll(query, user);
  }

  /**
   * Exporta las cotizaciones filtradas a Excel (.xlsx).
   * Hoja 1 "Cotizaciones": resumen + seguimiento comercial.
   * Hoja 2 "Detalle de ítems": una fila por partida de cada cotización.
   * Mismo criterio de acceso que `findAll` (cualquier usuario autenticado).
   */
  @Get('export/xlsx')
  async exportXlsx(
    @Query() query: QueryQuotesDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.quotesService.findAll({ ...query, limit: 2000, page: 1 }, user);

    const columns: ReportColumn<Quote>[] = [
      { header: 'Número', value: (q) => q.number ?? '' },
      { header: 'Título', value: (q) => q.title ?? '', width: 42 },
      { header: 'Cliente', value: (q) => q.client?.name ?? '' },
      { header: 'Código proyecto', value: (q) => q.project?.code ?? '' },
      { header: 'Proyecto', value: (q) => q.project?.name ?? '' },
      { header: 'Estado', value: (q) => QUOTE_STATUS_ES[q.status] ?? q.status },
      { header: 'Fecha de creación', value: (q) => localDateOnly(q.createdAt), type: 'date' },
      { header: 'Válida hasta', value: (q) => dateOnly(q.validUntil), type: 'date' },
      { header: 'Ítems', value: (q) => q.items?.length ?? 0, type: 'int' },
      { header: 'Subtotal RD$', value: (q) => q.subtotal ?? 0, type: 'money', total: true },
      { header: 'Descuento RD$', value: (q) => q.discount ?? 0, type: 'money', total: true },
      { header: 'ITBIS RD$', value: (q) => q.taxAmount ?? 0, type: 'money', total: true },
      { header: 'Total RD$', value: (q) => q.total ?? 0, type: 'money', total: true },
      { header: 'Enviada el', value: (q) => localDateTime(q.sentAt), type: 'datetime' },
      { header: 'Recordatorios', value: (q) => q.reminderCount ?? 0, type: 'int' },
      { header: 'Fecha de decisión', value: (q) => localDateTime(q.decidedAt), type: 'datetime' },
    ];

    const filters: ReportFilter[] = [];
    if (query.status) {
      filters.push({ label: 'Estado', value: QUOTE_STATUS_ES[query.status] ?? query.status });
    }
    if (query.clientId) {
      filters.push({
        label: 'Cliente',
        value: data.find((q) => q.clientId === query.clientId)?.client?.name ?? query.clientId,
      });
    }
    if (query.projectId) {
      const p = data.find((q) => q.projectId === query.projectId)?.project;
      filters.push({ label: 'Proyecto', value: p ? `${p.code} — ${p.name}` : query.projectId });
    }
    if (query.search) filters.push({ label: 'Búsqueda', value: query.search });

    const workbook = createWorkbook();
    addReportSheet<Quote>(workbook, {
      sheetName: 'Cotizaciones',
      title: 'Reporte de Cotizaciones',
      filters,
      columns,
      rows: data,
      totalsLabel: 'TOTAL',
    });

    // Solo las HOJAS del árbol de partidas: incluir también los grupos duplicaría
    // los importes y rompería la fila TOTAL de la hoja. La jerarquía se conserva
    // en la columna "Partida" como ruta ("Baño > Piso").
    const itemRows: QuoteItemRow[] = data.flatMap((q) => {
      const tree = rowsToTree(q.items ?? []);
      return flattenTree(tree)
        .filter((n) => n.children.length === 0 && n.row.kind !== 'group')
        .map((n) => ({
          quoteNumber: q.number ?? '',
          clientName: q.client?.name ?? '',
          sectionName: ancestorPath(tree, n.row.id),
          numbering: n.label,
          description: n.row.description ?? '',
          unit: n.row.unit ?? '',
          quantity: n.row.quantity ?? 0,
          unitPrice: n.row.unitPrice ?? 0,
          discountPct: n.row.discountPct ?? 0,
          total: n.row.total ?? 0,
        }));
    });

    addReportSheet<QuoteItemRow>(workbook, {
      sheetName: 'Detalle de ítems',
      title: 'Detalle de Ítems por Cotización',
      filters,
      columns: [
        { header: 'Cotización', value: (r) => r.quoteNumber },
        { header: 'Cliente', value: (r) => r.clientName },
        { header: 'Nº', value: (r) => r.numbering },
        { header: 'Partida', value: (r) => r.sectionName, width: 32 },
        { header: 'Descripción', value: (r) => r.description, width: 50 },
        { header: 'Unidad', value: (r) => r.unit },
        { header: 'Cantidad', value: (r) => r.quantity, type: 'number' },
        { header: 'Precio unitario RD$', value: (r) => r.unitPrice, type: 'money' },
        { header: 'Descuento %', value: (r) => r.discountPct, type: 'percent' },
        { header: 'Total RD$', value: (r) => r.total, type: 'money', total: true },
      ],
      rows: itemRows,
      totalsLabel: 'TOTAL ÍTEMS',
    });

    await sendWorkbook(res, workbook, 'cotizaciones');
  }

  @Get(':id')
  @ScopedResource('quote')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findOne(id);
  }

  @Get(':id/pdf-file')
  @ScopedResource('quote')
  async getPdfFile(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.quotesService.findPdfFile(id);
    if (!file) throw new NotFoundException('PDF no disponible todavía');
    return file;
  }

  @Patch(':id')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: AuthUser) {
    return this.quotesService.update(id, dto, user.role);
  }

  @Post(':id/send')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  sendEmail(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.sendEmail(id);
  }

  @Post(':id/revise')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  revise(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quotesService.revise(id, user.id);
  }

  @Post(':id/convert-to-project')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  convertToProject(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.quotesService.convertToProject(id, user.id);
  }

  @Delete(':id')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.remove(id);
  }

  // ── Partidas de costos (ACU) ───────────────────────────────────────────────

  /**
   * Aviso de precios viejos: qué líneas nacidas de un ACU tienen el unitario congelado
   * desfasado respecto al costo de hoy, y en cuánto. Solo lectura: no cambia nada.
   */
  @Get(':id/acu-drift')
  @ScopedResource('quote')
  acuDrift(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.acuDrift(id);
  }

  /**
   * Vuelve a congelar esos unitarios con los costos de hoy. Es la única vía por la que
   * el precio de una cotización cambia por el módulo de costos, y es siempre explícita.
   */
  @Post(':id/acu-refresh')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  refreshAcuPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefreshAcuPricesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.refreshAcuPrices(id, dto, user.role);
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  @Post(':id/items')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateQuoteItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.addItem(id, dto, user.role);
  }

  @Patch(':id/items/:itemId')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateQuoteItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.updateItem(id, itemId, dto, user.role);
  }

  @Delete(':id/items/:itemId')
  @ScopedResource('quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quotesService.removeItem(id, itemId, user.role);
  }
}
