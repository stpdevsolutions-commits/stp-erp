import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  BadRequestException,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { GeneralReportService } from './general-report.service';
import { buildGeneralDoc } from './general-report-tables';
import { SettingsService } from '../settings/settings.service';
import { sendWorkbook } from '../common/excel-report';
import { docToPdf, docToWorkbook } from './report-export';
import {
  buildClientDoc,
  buildExpensesDoc,
  buildFichasDoc,
  buildIncomeDoc,
  buildPayrollDoc,
  buildProjectDoc,
  type ExportDoc,
} from './report-tables';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
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

// `dashboard` y `analytics` alimentan el "Resumen" (home), no la seccion
// "Reportes" -- se quedan abiertos a cualquier autenticado, ReportsService
// acota cada agregación a su ámbito (getListScope) igual que el listado de
// cada módulo, un USER ve un resumen real limitado a sus proyectos/clientes.
// El resto de endpoints de este controlador SI son la seccion "Reportes" de
// la matriz (ERP-83/ERP-85: admin/manager/finanza ven, user = ninguno) y
// llevan @RequireModule('reportes','view') caso por caso, no a nivel de
// clase, justamente para no bloquear dashboard/analytics sin querer. Las
// rutas por :id pasan además por ResourceAccessGuard (404 si el recurso es ajeno).
@Controller('reports')
@UseGuards(JwtAuthGuard, ResourceAccessGuard, ModulePermissionGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly generalReportService: GeneralReportService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Envía un reporte ya construido en el formato pedido.
   *
   * El PDF va `inline` (se abre en el visor, listo para imprimir) y el Excel como
   * descarga: un .xlsx en el visor del navegador no sirve de nada.
   */
  private async enviar(res: Response, doc: ExportDoc, formato: 'pdf' | 'xlsx'): Promise<void> {
    if (formato === 'xlsx') {
      await sendWorkbook(res, docToWorkbook(doc), doc.filename);
      return;
    }
    const company = await this.settingsService.getCompanyData();
    const buffer = await docToPdf(doc, company);
    const filename = `${doc.filename}_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  private parseFormato(valor?: string): 'pdf' | 'xlsx' {
    if (valor === 'pdf' || valor === 'xlsx') return valor;
    throw new BadRequestException('El formato debe ser "pdf" o "xlsx"');
  }

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
  @RequireModule('reportes', 'view')
  getIncomeReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.reportsService.getIncomeReport(range.from, range.to, user);
  }

  @Get('expenses')
  @RequireModule('reportes', 'view')
  getExpensesReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.reportsService.getExpensesReport(range.from, range.to, user);
  }

  @Get('fichas')
  @RequireModule('reportes', 'view')
  getFichasReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.reportsService.getFichasReport(range.from, range.to, user);
  }

  /**
   * Reporte de nómina (ERP-105). A diferencia del resto de reportes de esta
   * sección, que exigen 'reportes' view, este exige 'nomina' view — Nómina es
   * información salarial y su confidencialidad (admin/finanza, no manager) no
   * puede quedar expuesta por un lateral vía Reportes (ver payroll.controller.ts).
   */
  @Get('payroll')
  @RequireModule('nomina', 'view')
  getPayrollReport(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseDateRange(from, to);
    return this.reportsService.getPayrollReport(range.from, range.to);
  }

  @Get('payroll/export')
  @RequireModule('nomina', 'view')
  async exportPayroll(
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseDateRange(from, to);
    const report = await this.reportsService.getPayrollReport(range.from, range.to);
    await this.enviar(res, buildPayrollDoc(report), this.parseFormato(format));
  }

  /**
   * Reporte general del negocio en un período: ingresos, gastos y UTILIDAD, más
   * cotizaciones, nómina, proyectos y fichas.
   *
   * `compare=false` desactiva la comparativa con el período anterior (que cuesta
   * una segunda pasada por ingresos y gastos).
   */
  @Get('general')
  @RequireModule('reportes', 'view')
  getGeneralReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compare') compare?: string,
  ) {
    const range = parseDateRange(from, to);
    return this.generalReportService.getGeneralReport(range.from, range.to, user, {
      comparar: compare !== 'false',
    });
  }

  @Get('general/export')
  @RequireModule('reportes', 'view')
  async exportGeneral(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseDateRange(from, to);
    const report = await this.generalReportService.getGeneralReport(range.from, range.to, user);
    await this.enviar(res, buildGeneralDoc(report), this.parseFormato(format));
  }

  @Get('projects/:id')
  @ScopedResource('project')
  @RequireModule('reportes', 'view')
  getProjectSummary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reportsService.getProjectSummary(id, user);
  }

  @Get('clients/:id')
  @ScopedResource('client')
  @RequireModule('reportes', 'view')
  getClientBalance(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reportsService.getClientBalance(id, user);
  }

  // ── Exportación ──────────────────────────────────────────────────────────
  // Cada reporte se exporta con los MISMOS filtros con los que se está viendo,
  // reusando el método que ya lo calcula: el archivo no puede decir algo distinto
  // de lo que hay en pantalla.

  @Get('income/export')
  @RequireModule('reportes', 'view')
  async exportIncome(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseDateRange(from, to);
    const report = await this.reportsService.getIncomeReport(range.from, range.to, user);
    await this.enviar(res, buildIncomeDoc(report), this.parseFormato(format));
  }

  @Get('expenses/export')
  @RequireModule('reportes', 'view')
  async exportExpenses(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseDateRange(from, to);
    const report = await this.reportsService.getExpensesReport(range.from, range.to, user);
    await this.enviar(res, buildExpensesDoc(report), this.parseFormato(format));
  }

  @Get('fichas/export')
  @RequireModule('reportes', 'view')
  async exportFichas(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const range = parseDateRange(from, to);
    const report = await this.reportsService.getFichasReport(range.from, range.to, user);
    await this.enviar(res, buildFichasDoc(report), this.parseFormato(format));
  }

  @Get('projects/:id/export')
  @ScopedResource('project')
  @RequireModule('reportes', 'view')
  async exportProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
  ): Promise<void> {
    const report = await this.reportsService.getProjectSummary(id, user);
    await this.enviar(res, buildProjectDoc(report), this.parseFormato(format));
  }

  @Get('clients/:id/export')
  @ScopedResource('client')
  @RequireModule('reportes', 'view')
  async exportClient(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
  ): Promise<void> {
    const report = await this.reportsService.getClientBalance(id, user);
    await this.enviar(res, buildClientDoc(report), this.parseFormato(format));
  }
}
