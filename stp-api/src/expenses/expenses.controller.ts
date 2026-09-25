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
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';
import type { Expense } from './entities/expense.entity';
import {
  addReportSheet,
  createWorkbook,
  dateOnly,
  sendWorkbook,
  type ReportColumn,
  type ReportFilter,
} from '../common/excel-report';

interface AuthUser { id: string; role: UserRole; }

const EXPENSE_CATEGORY_ES: Record<string, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte',
  other: 'Otro',
};

/**
 * Modulo 'gastos' (ERP-83/ERP-85): admin/manager/finanza = manage, user =
 * ninguno -- antes crear un gasto no tenia @Roles en absoluto (cualquier
 * autenticado con pertenencia al proyecto podia), la matriz lo cierra a
 * proposito.
 *
 * ERP-108: Manager esta en UNRESTRICTED_ROLES (bypasa pertenencia) en el
 * resto del sistema, pero aqui se le excluye a proposito via
 * `restrictRoles: [MANAGER]` en cada @ScopedResource -- para Gastos debe
 * comportarse como un USER: solo ve/crea/edita gastos de sus proyectos
 * asignados (pertenencia via Accesos o campo Encargado), no de cualquiera.
 * Admin sigue sin restriccion. Finanza ya pasaba por pertenencia desde
 * antes (nunca estuvo en UNRESTRICTED_ROLES).
 */
@Controller('expenses')
@UseGuards(JwtAuthGuard, ResourceAccessGuard, ModulePermissionGuard)
@RequireModule('gastos', 'manage')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ScopedResource({
    kind: 'project',
    param: 'projectId',
    in: 'body',
    restrictRoles: [UserRole.MANAGER],
  })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expensesService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryExpensesDto, @CurrentUser() user: AuthUser) {
    return this.expensesService.findAll(query, user);
  }

  /**
   * Total del mes calendario en curso, sin paginar. Antes la tarjeta "Este mes" del
   * frontend sumaba solo `data` de `findAll` (la página actual, máx. `limit` filas):
   * con más de una página de gastos ese mes, el número mostrado era una fracción del
   * real.
   */
  @Get('summary')
  summary(@Query() query: QueryExpensesDto, @CurrentUser() user: AuthUser) {
    return this.expensesService.sumThisMonth(query, user);
  }

  /** Exporta los gastos filtrados a Excel (.xlsx) con formato e identidad STP. */
  @Get('export/xlsx')
  async exportXlsx(
    @Query() query: QueryExpensesDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.expensesService.findAll({ ...query, limit: 5000, page: 1 }, user);

    const columns: ReportColumn<Expense>[] = [
      { header: 'Fecha', value: (e) => dateOnly(e.date), type: 'date' },
      { header: 'Descripción', value: (e) => e.description ?? '' },
      { header: 'Categoría', value: (e) => EXPENSE_CATEGORY_ES[e.category] ?? e.category },
      { header: 'Proveedor', value: (e) => e.supplier?.name ?? '' },
      { header: 'Código proyecto', value: (e) => e.project?.code ?? '' },
      { header: 'Proyecto', value: (e) => e.project?.name ?? '' },
      { header: 'Monto RD$', value: (e) => e.amount ?? 0, type: 'money', total: true },
      { header: 'Notas', value: (e) => e.notes ?? '', width: 40 },
      {
        header: 'Registrado por',
        value: (e) =>
          e.createdBy ? `${e.createdBy.firstName ?? ''} ${e.createdBy.lastName ?? ''}`.trim() : '',
      },
    ];

    const filters: ReportFilter[] = [];
    if (query.dateFrom) filters.push({ label: 'Desde', value: query.dateFrom });
    if (query.dateTo) filters.push({ label: 'Hasta', value: query.dateTo });
    if (query.projectId) {
      const p = data.find((x) => x.projectId === query.projectId)?.project;
      filters.push({ label: 'Proyecto', value: p ? `${p.code} — ${p.name}` : query.projectId });
    }
    if (query.category) {
      filters.push({
        label: 'Categoría',
        value: EXPENSE_CATEGORY_ES[query.category] ?? query.category,
      });
    }

    const workbook = createWorkbook();
    addReportSheet<Expense>(workbook, {
      sheetName: 'Gastos',
      title: 'Reporte de Gastos Operativos',
      filters,
      columns,
      rows: data,
      totalsLabel: 'TOTAL',
    });

    await sendWorkbook(res, workbook, 'gastos');
  }

  @Get(':id')
  @ScopedResource({ kind: 'expense', restrictRoles: [UserRole.MANAGER] })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.findOne(id);
  }

  @Get(':id/pdf-file')
  @ScopedResource({ kind: 'expense', restrictRoles: [UserRole.MANAGER] })
  async getPdfFile(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.expensesService.findPdfFile(id);
    if (!file) throw new NotFoundException('PDF no disponible todavía');
    return file;
  }

  @Patch(':id')
  @ScopedResource({ kind: 'expense', restrictRoles: [UserRole.MANAGER] })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(id, dto);
  }

  @Delete(':id')
  @ScopedResource('expense')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.expensesService.remove(id, user.id);
  }
}
