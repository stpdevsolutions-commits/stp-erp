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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser { id: string; role: UserRole; }

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expensesService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryExpensesDto) {
    return this.expensesService.findAll(query);
  }

  @Get('export/csv')
  async exportCsv(@Query() query: QueryExpensesDto, @Res() res: Response) {
    const { data } = await this.expensesService.findAll({ ...query, limit: 5000, page: 1 });
    const CATEGORY: Record<string, string> = {
      materials: 'Materiales', labor: 'Mano de obra', equipment: 'Equipos',
      subcontract: 'Subcontrato', travel: 'Transporte', other: 'Otro',
    };
    const header = 'Fecha,Descripción,Categoría,Proveedor,Proyecto,Monto RD$\n';
    const rows = data.map((e) => [
      e.date,
      `"${(e.description ?? '').replace(/"/g, '""')}"`,
      CATEGORY[e.category] ?? e.category,
      `"${(e.supplier?.name ?? '').replace(/"/g, '""')}"`,
      `"${(e.project?.name ?? '').replace(/"/g, '""')}"`,
      e.amount.toFixed(2),
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gastos_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('﻿' + header + rows);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.findOne(id);
  }

  @Get(':id/pdf-file')
  async getPdfFile(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.expensesService.findPdfFile(id);
    if (!file) throw new NotFoundException('PDF no disponible todavía');
    return file;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.remove(id);
  }
}
