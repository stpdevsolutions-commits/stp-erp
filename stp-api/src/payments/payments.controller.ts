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

interface AuthUser { id: string; role: UserRole; }

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

  @Get('export/csv')
  async exportCsv(@Query() query: QueryPaymentsDto, @Res() res: Response) {
    const { data } = await this.paymentsService.findAll({ ...query, limit: 5000, page: 1 });
    const METHOD: Record<string, string> = {
      cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', card: 'Tarjeta', other: 'Otro',
    };
    const STATUS: Record<string, string> = {
      completed: 'Completado', pending: 'Pendiente', failed: 'Fallido', refunded: 'Reembolsado',
    };
    const header = 'Fecha,Descripción,Cliente,Proyecto,Método,Estado,Monto RD$\n';
    const rows = data.map((p) => [
      p.date,
      `"${(p.description ?? '').replace(/"/g, '""')}"`,
      `"${(p.client?.name ?? '').replace(/"/g, '""')}"`,
      `"${(p.project?.name ?? '').replace(/"/g, '""')}"`,
      METHOD[p.method] ?? p.method,
      STATUS[p.status] ?? p.status,
      p.amount.toFixed(2),
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pagos_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('﻿' + header + rows);
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
