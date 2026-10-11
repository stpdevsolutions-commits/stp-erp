import {
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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { SalesInvoicesService } from './sales-invoices.service';
import {
  AddInvoicePaymentDto,
  ApplyPaymentDto,
  CreateCreditNoteDto,
  CreateSalesInvoiceDto,
  EmitSalesInvoiceDto,
  PreviewFromQuoteDto,
  QuerySalesInvoicesDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  role: UserRole;
}

/**
 * Facturas de venta con e-CF. Mismo módulo de permisos que las facturas recibidas
 * ('facturas'): admin y finanza gestionan; manager y user no ven nada.
 */
@Controller('sales-invoices')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('facturas', 'view')
export class SalesInvoicesController {
  constructor(private readonly service: SalesInvoicesService) {}

  @Get()
  findAll(@Query() query: QuerySalesInvoicesDto) {
    return this.service.findAll(query);
  }

  /** Líneas que saldrían de una cotización aprobada (y cuánto queda por facturar). */
  @Get('from-quote')
  previewFromQuote(@Query() query: PreviewFromQuoteDto) {
    return this.service.previewFromQuote(query.quoteId, query.percent ?? 100);
  }

  @Post()
  @RequireModule('facturas', 'manage')
  create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** Crea (en borrador) una nota de crédito contra una factura emitida. */
  @Post(':id/credit-note')
  @RequireModule('facturas', 'manage')
  createCreditNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCreditNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createCreditNote(id, dto, user.id);
  }

  /** PDF de la factura (borrador o emitida). */
  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.service.pdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Patch(':id')
  @RequireModule('facturas', 'manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequireModule('facturas', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.id);
  }

  /** Emite el e-CF por ecf-api. Solo una vez por factura. */
  @Post(':id/emit')
  @HttpCode(HttpStatus.OK)
  @RequireModule('facturas', 'manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  emit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmitSalesInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.emit(id, dto ?? {}, user.id);
  }

  @Post(':id/refresh-ecf')
  @HttpCode(HttpStatus.OK)
  @RequireModule('facturas', 'manage')
  refreshEcf(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.refreshEcf(id);
  }

  @Post(':id/transmit')
  @HttpCode(HttpStatus.OK)
  @RequireModule('facturas', 'manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  transmit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.transmit(id, user.id);
  }

  @Get(':id/payments')
  listPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listPayments(id);
  }

  @Get(':id/available-payments')
  availablePayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.availablePayments(id);
  }

  /** Registra un cobro nuevo, ya aplicado a esta factura. */
  @Post(':id/payments')
  @RequireModule('facturas', 'manage')
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddInvoicePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addPayment(id, dto, user.id);
  }

  /** Aplica a esta factura un cobro que ya estaba en Pagos. */
  @Post(':id/apply-payment')
  @HttpCode(HttpStatus.OK)
  @RequireModule('facturas', 'manage')
  applyPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.applyPayment(id, dto.paymentId, user.id);
  }

  @Delete(':id/payments/:paymentId')
  @RequireModule('facturas', 'manage')
  unlinkPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.unlinkPayment(id, paymentId, user.id);
  }
}
