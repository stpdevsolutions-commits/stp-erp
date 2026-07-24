import { Controller, Get, Param, ParseUUIDPipe, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

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

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.reportsService.getDashboard();
  }

  /**
   * Series agregadas para las gráficas del dashboard.
   * `months` = ventana hacia atrás (1–24, por defecto 6).
   */
  @Get('analytics')
  getAnalytics(@Query('months') months?: string) {
    const parsed = months != null ? Number(months) : 6;
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24)
      throw new BadRequestException('El parámetro "months" debe ser un número entre 1 y 24');
    return this.reportsService.getAnalytics(parsed);
  }

  @Get('income')
  getIncomeReport(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseDateRange(from, to);
    return this.reportsService.getIncomeReport(range.from, range.to);
  }

  @Get('expenses')
  getExpensesReport(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseDateRange(from, to);
    return this.reportsService.getExpensesReport(range.from, range.to);
  }

  @Get('fichas')
  getFichasReport(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseDateRange(from, to);
    return this.reportsService.getFichasReport(range.from, range.to);
  }

  @Get('projects/:id')
  getProjectSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.getProjectSummary(id);
  }

  @Get('clients/:id')
  getClientBalance(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.getClientBalance(id);
  }
}
