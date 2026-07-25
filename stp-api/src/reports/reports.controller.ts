import { Controller, Get, Param, ParseUUIDPipe, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

function parseDateRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const f = from ?? firstOfMonth;
  const t = to ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t))
    throw new BadRequestException('Las fechas deben tener formato YYYY-MM-DD');
  if (f > t) throw new BadRequestException('La fecha "from" no puede ser posterior a "to"');
  return { from: f, to: t };
}

// Los reportes YA NO son exclusivos de MANAGER: cualquier usuario autenticado
// entra, pero ReportsService acota cada agregación a su ámbito (getListScope),
// igual que el listado de cada módulo. Un USER ve un dashboard real limitado a
// sus proyectos/clientes; ADMIN/MANAGER lo ven todo. Las rutas por :id pasan
// además por ResourceAccessGuard (404 si el recurso es ajeno).
@Controller('reports')
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.reportsService.getDashboard(user);
  }

  /**
   * Series agregadas para las gráficas del dashboard.
   * `months` = ventana hacia atrás (1–24, por defecto 6).
   */
  @Get('analytics')
  getAnalytics(@CurrentUser() user: AuthUser, @Query('months') months?: string) {
    const parsed = months != null ? Number(months) : 6;
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24)
      throw new BadRequestException('El parámetro "months" debe ser un número entre 1 y 24');
    return this.reportsService.getAnalytics(parsed, user);
  }

  @Get('income')
  getIncomeReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.reportsService.getIncomeReport(range.from, range.to, user);
  }

  @Get('expenses')
  getExpensesReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.reportsService.getExpensesReport(range.from, range.to, user);
  }

  @Get('fichas')
  getFichasReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.reportsService.getFichasReport(range.from, range.to, user);
  }

  @Get('projects/:id')
  @ScopedResource('project')
  getProjectSummary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reportsService.getProjectSummary(id, user);
  }

  @Get('clients/:id')
  @ScopedResource('client')
  getClientBalance(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reportsService.getClientBalance(id, user);
  }
}
