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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import type { Payment } from './entities/payment.entity';
import {
  addReportSheet,
  createWorkbook,
  dateOnly,
  sendWorkbook,
  type ReportColumn,
  type ReportFilter,
} from '../common/excel-report';

interface AuthUser { id: string; role: UserRole; }

const PAYMENT_METHOD_ES: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
};

const PAYMENT_STATUS_ES: Record<string, string> = {
  completed: 'Completado',
  pending: 'Pendiente',
  failed: 'Fallido',
  refunded: 'Reembolsado',
};

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.paymentsService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryPaymentsDto) {
    return this.paymentsService.findAll(query);
  }

  /** Exporta los pagos filtrados a Excel (.xlsx) con formato e identidad STP. */
  @Get('export/xlsx')
  async exportXlsx(@Query() query: QueryPaymentsDto, @Res() res: Response): Promise<void> {
    const { data } = await this.paymentsService.findAll({ ...query, limit: 5000, page: 1 });

    const columns: ReportColumn<Payment>[] = [
      { header: 'Fecha', value: (p) => dateOnly(p.date), type: 'date' },
      { header: 'Descripción', value: (p) => p.description ?? '' },
      { header: 'Referencia', value: (p) => p.reference ?? '' },
      { header: 'Cliente', value: (p) => p.client?.name ?? '' },
      { header: 'Código proyecto', value: (p) => p.project?.code ?? '' },
      { header: 'Proyecto', value: (p) => p.project?.name ?? '' },
      { header: 'Cotización', value: (p) => p.quote?.number ?? '' },
      { header: 'Método', value: (p) => PAYMENT_METHOD_ES[p.method] ?? p.method },
      { header: 'Estado', value: (p) => PAYMENT_STATUS_ES[p.status] ?? p.status },
      { header: 'Monto RD$', value: (p) => p.amount ?? 0, type: 'money', total: true },
      { header: 'Notas', value: (p) => p.notes ?? '', width: 40 },
      {
        header: 'Registrado por',
        value: (p) =>
          p.createdBy ? `${p.createdBy.firstName ?? ''} ${p.createdBy.lastName ?? ''}`.trim() : '',
      },
    ];

    const filters: ReportFilter[] = [];
    if (query.dateFrom) filters.push({ label: 'Desde', value: query.dateFrom });
    if (query.dateTo) filters.push({ label: 'Hasta', value: query.dateTo });
    if (query.clientId) {
      filters.push({
        label: 'Cliente',
        value: data.find((p) => p.clientId === query.clientId)?.client?.name ?? query.clientId,
      });
    }
    if (query.projectId) {
      const p = data.find((x) => x.projectId === query.projectId)?.project;
      filters.push({ label: 'Proyecto', value: p ? `${p.code} — ${p.name}` : query.projectId });
    }
    if (query.quoteId) {
      filters.push({
        label: 'Cotización',
        value: data.find((x) => x.quoteId === query.quoteId)?.quote?.number ?? query.quoteId,
      });
    }
    if (query.method) {
      filters.push({ label: 'Método', value: PAYMENT_METHOD_ES[query.method] ?? query.method });
    }
    if (query.status) {
      filters.push({ label: 'Estado', value: PAYMENT_STATUS_ES[query.status] ?? query.status });
    }
    if (query.search) filters.push({ label: 'Búsqueda', value: query.search });

    const workbook = createWorkbook();
    addReportSheet<Payment>(workbook, {
      sheetName: 'Pagos',
      title: 'Reporte de Pagos Recibidos',
      filters,
      columns,
      rows: data,
      totalsLabel: 'TOTAL',
    });

    await sendWorkbook(res, workbook, 'pagos');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findOne(id);
  }

  @Get(':id/pdf-file')
  async getPdfFile(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.paymentsService.findPdfFile(id);
    if (!file) throw new NotFoundException('PDF no disponible todavía');
    return file;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.paymentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.remove(id);
  }
}
