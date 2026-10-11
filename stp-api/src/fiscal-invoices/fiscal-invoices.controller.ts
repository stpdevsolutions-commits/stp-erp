import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { FiscalInvoicesService } from './fiscal-invoices.service';
import {
  ApplyLinksDto,
  AssignFiscalInvoicesDto,
  ExpenseCandidatesQueryDto,
  FromQrDto,
  LinkExpenseDto,
  CreateFiscalInvoiceDto,
  QueryFiscalInvoicesDto,
  UpdateFiscalInvoiceDto,
  ValidateDgiiDto,
  ValidatePendingDto,
} from './dto/fiscal-invoice.dto';
import { fiscalInvoicePhotoOpts, invoiceScanUploadOpts } from './fiscal-invoice-upload';
import { CATALOGOS_606, toRow606, type Row606 } from './form-606';
import {
  addReportSheet,
  createWorkbook,
  sendWorkbook,
  type ReportColumn,
  type ReportFilter,
} from '../common/excel-report';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  role: UserRole;
}

/**
 * Módulo 'facturas' (ERP-35): comprobantes fiscales de compra, la base del 606.
 * admin y finanza = manage; manager y user = ninguno (son datos tributarios de la
 * empresa, no de un proyecto concreto). Borrar es solo de admin.
 */
@Controller('fiscal-invoices')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('facturas', 'view')
export class FiscalInvoicesController {
  constructor(private readonly service: FiscalInvoicesService) {}

  @Post()
  @RequireModule('facturas', 'manage')
  create(@Body() dto: CreateFiscalInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryFiscalInvoicesDto) {
    return this.service.findAll(query);
  }

  /**
   * Excel del Formato 606 con las facturas del período (ERP-38), todas: con o sin
   * proyecto. Es la planilla de referencia que usa el contador (las mismas columnas que
   * tenía FiscoRD), con el estado en la DGII y el proyecto al final.
   */
  @Get('export/606')
  async export606(@Query() query: QueryFiscalInvoicesDto, @Res() res: Response): Promise<void> {
    const invoices = await this.service.findForExport(query);
    const rows = invoices.map(toRow606);

    const columns: ReportColumn<Row606>[] = [
      { header: 'RNC/Cédula proveedor [Col 1]', value: (r) => r.rnc, width: 16 },
      { header: 'Tipo ID [Col 2]', value: (r) => r.tipoId, width: 8 },
      { header: 'Cód. tipo gasto [Col 3]', value: (r) => r.tipoGasto, width: 10 },
      { header: 'Tipo de gasto', value: (r) => r.descripcionGasto, width: 34 },
      { header: 'NCF [Col 4]', value: (r) => r.ncf, width: 17 },
      { header: 'Proveedor', value: (r) => r.proveedor, width: 32 },
      { header: 'Año-mes [Col 6] AAAAMM', value: (r) => r.anomes, width: 12 },
      { header: 'Día [Col 6]', value: (r) => r.dia, width: 7 },
      { header: 'Monto facturado en servicios [Col 8]', value: (r) => r.servicios, type: 'money', total: true },
      { header: 'Monto facturado en bienes [Col 9]', value: (r) => r.bienes, type: 'money', total: true },
      { header: 'ITBIS facturado [Col 11]', value: (r) => r.itbis, type: 'money', total: true },
      { header: 'Impuesto selectivo [Col 20]', value: (r) => r.isc, type: 'money', total: true },
      { header: 'Otros impuestos/tasas [Col 21]', value: (r) => r.otrosImpuestos, type: 'money', total: true },
      { header: 'Propina legal [Col 22]', value: (r) => r.propina, type: 'money', total: true },
      { header: 'Forma de pago [Col 23]', value: (r) => r.formaPago, width: 10 },
      { header: 'Total facturado (referencia)', value: (r) => r.totalFacturado, type: 'money', total: true },
      { header: 'Tipo NCF (referencia)', value: (r) => r.ncfType, width: 10 },
      { header: 'Total general (referencia)', value: (r) => r.totalGeneral, type: 'money', total: true },
      { header: 'Estado DGII', value: (r) => r.estadoDgii, width: 14 },
      { header: 'Proyecto', value: (r) => r.proyecto, width: 14 },
    ];

    const filters: ReportFilter[] = [];
    if (query.dateFrom) filters.push({ label: 'Desde', value: query.dateFrom });
    if (query.dateTo) filters.push({ label: 'Hasta', value: query.dateTo });
    if (query.expenseType) filters.push({ label: 'Tipo de gasto', value: query.expenseType });
    if (query.project) {
      filters.push({ label: 'Proyecto', value: query.project === 'with' ? 'Con proyecto' : 'Gastos generales' });
    }

    const workbook = createWorkbook();
    addReportSheet<Row606>(workbook, {
      sheetName: 'Formato 606',
      title: 'Formato 606 — Compras de bienes y servicios (referencia)',
      filters,
      columns,
      rows,
      totalsLabel: 'TOTALES',
    });
    type Catalogo = (typeof CATALOGOS_606)[number];
    addReportSheet<Catalogo>(workbook, {
      sheetName: 'Catálogos 606',
      title: 'Catálogos DGII — Formato 606',
      columns: [
        { header: 'Catálogo', value: (c) => c.catalogo, width: 46 },
        { header: 'Código', value: (c) => c.codigo, width: 10 },
        { header: 'Descripción', value: (c) => c.descripcion, width: 60 },
      ],
      rows: CATALOGOS_606,
      noTotals: true,
    });

    const period = (query.dateFrom ?? '').slice(0, 7).replace('-', '');
    await sendWorkbook(res, workbook, period ? `606_${period}` : '606');
  }

  /** Gastos ya registrados a mano que se parecen a una factura que se está por guardar (ERP-50). */
  @Get('expense-candidates')
  @RequireModule('facturas', 'manage')
  expenseCandidates(@Query() query: ExpenseCandidatesQueryDto) {
    return this.service.expenseCandidates(query);
  }

  /** Conciliación: el gasto manual que corresponde a cada factura sin gasto. */
  @Get('reconcile')
  @RequireModule('facturas', 'manage')
  reconcile() {
    return this.service.reconciliation();
  }

  /** Confirma varias vinculaciones propuestas por la conciliación. */
  @Post('reconcile/apply')
  @HttpCode(HttpStatus.OK) // actualiza facturas existentes
  @RequireModule('facturas', 'manage')
  applyLinks(@Body() dto: ApplyLinksDto, @CurrentUser() user: AuthUser) {
    return this.service.applyLinks(dto.pairs, user.id);
  }

  /** La factura que originó un gasto (el detalle del gasto la muestra). */
  @Get('by-expense/:expenseId')
  byExpense(@Param('expenseId', ParseUUIDPipe) expenseId: string) {
    return this.service.findByExpense(expenseId);
  }

  /**
   * Lee una factura (foto o PDF) con IA y devuelve los campos sugeridos (ERP-36). No guarda
   * nada. Cada lectura cuesta, así que va limitada: 30 por hora.
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK) // lee, no crea nada
  @RequireModule('facturas', 'manage')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', invoiceScanUploadOpts))
  scan(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Adjunta la foto o el PDF de la factura en el campo "file"');
    return this.service.scan(file.buffer, file.mimetype);
  }

  /** Lee el QR de un e-CF: devuelve los campos del formulario. No guarda nada (ERP-36). */
  @Post('from-qr')
  @HttpCode(HttpStatus.OK) // lee, no crea nada
  @RequireModule('facturas', 'manage')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  fromQr(@Body() dto: FromQrDto) {
    return this.service.fromQr(dto.text);
  }

  /** Tipo de gasto, forma de pago y nombre habituales de un proveedor, por su RNC. */
  @Get('suggest')
  suggest(@Query('rnc') rnc?: string) {
    return this.service.suggest(rnc ?? '');
  }

  /** Asigna varias facturas a un proyecto (uuid) o a gastos generales (null) de una vez. */
  @Post('assign')
  @HttpCode(HttpStatus.OK) // actualiza facturas existentes
  @RequireModule('facturas', 'manage')
  assign(@Body() dto: AssignFiscalInvoicesDto, @CurrentUser() user: AuthUser) {
    return this.service.assign(dto.ids, dto.projectId, user.id);
  }

  @Get(':id/expense-candidates')
  @RequireModule('facturas', 'manage')
  candidatesForInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.candidatesForInvoice(id);
  }

  @Post(':id/link-expense')
  @HttpCode(HttpStatus.OK) // actualiza una factura existente
  @RequireModule('facturas', 'manage')
  linkExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkExpenseDto, @CurrentUser() user: AuthUser) {
    return this.service.linkExpense(id, dto.expenseId, user.id, !!dto.syncExpense);
  }

  @Delete(':id/link-expense')
  @RequireModule('facturas', 'manage')
  unlinkExpense(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.unlinkExpense(id, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequireModule('facturas', 'manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.id);
  }

  /** Consulta en la DGII, por tandas, las facturas que nunca se han consultado. */
  @Post('validate-pending')
  @HttpCode(HttpStatus.OK)
  @RequireModule('facturas', 'manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  validatePending(@Body() dto: ValidatePendingDto) {
    return this.service.validatePending(dto.limit, dto.exclude);
  }

  /** Consulta la factura en la DGII y guarda el resultado (ERP-37). */
  @Post(':id/validate-dgii')
  @HttpCode(HttpStatus.OK) // consulta; no crea ninguna factura
  @RequireModule('facturas', 'manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  validateDgii(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ValidateDgiiDto) {
    return this.service.validateWithDgii(id, dto.codigoSeguridad);
  }

  @Post(':id/photo')
  @RequireModule('facturas', 'manage')
  @UseInterceptors(FileInterceptor('file', fiscalInvoicePhotoOpts))
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Adjunta la foto en el campo "file"');
    return this.service.attachPhoto(id, file);
  }

  @Get(':id/photo')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { absolutePath, mimetype, filename } = await this.service.getPhoto(id);
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/["\r\n\\]/g, '_')}"`);
    res.sendFile(absolutePath);
  }
}
