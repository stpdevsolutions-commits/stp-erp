import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SettingsService } from '../settings/settings.service';
import { sendWorkbook } from '../common/excel-report';
import { docToPdf, docToWorkbook } from './report-export';
import { ProjectReportService } from './project-report.service';
import { ProjectReportType } from './entities/project-report.entity';
import { UpdateProjectReportDto } from './dto/update-project-report.dto';
import type { ExportDoc } from './report-tables';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Informes de proyecto: dos tipos (`interno` / `cliente`), ambos con parte
 * editable persistida.
 *
 * Va en su propio controlador y bajo su propio prefijo
 * (`reports/projects/:projectId/informe`) para no mezclarse con el resumen de
 * proyecto de `ReportsController`, que es otra cosa: aquel es una consulta,
 * este es un documento.
 *
 * Acceso: como el resto de reportes, un USER entra acotado a sus proyectos
 * (`ResourceAccessGuard` + `@ScopedResource`). El informe INTERNO además exige
 * MANAGER o ADMIN porque incluye nómina y márgenes — lo comprueba
 * `ProjectReportService.assertTipoPermitido`, no un `@Roles` de clase, porque
 * la restricción depende del tipo pedido y no del controlador entero.
 */
@Controller('reports/projects/:projectId/informe')
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
@ScopedResource({ kind: 'project', param: 'projectId' })
export class ProjectReportController {
  constructor(
    private readonly service: ProjectReportService,
    private readonly settingsService: SettingsService,
  ) {}

  /** `interno` / `cliente` en la URL; los valores internos siguen en inglés. */
  private parseTipo(valor: string): ProjectReportType {
    if (valor === 'interno') return ProjectReportType.INTERNAL;
    if (valor === 'cliente') return ProjectReportType.CLIENT;
    throw new BadRequestException('El tipo de informe debe ser "interno" o "cliente"');
  }

  private parseFormato(valor?: string): 'pdf' | 'xlsx' {
    if (valor === 'pdf' || valor === 'xlsx') return valor;
    throw new BadRequestException('El formato debe ser "pdf" o "xlsx"');
  }

  /**
   * Vista previa del informe: la parte editable y los datos calculados con los
   * que se va a imprimir. El frontend pinta exactamente esto, así que la
   * pantalla y el PDF no pueden decir cosas distintas.
   */
  @Get(':tipo')
  async getInforme(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('tipo') tipo: string,
    @CurrentUser() user: AuthUser,
  ) {
    const type = this.parseTipo(tipo);
    const data =
      type === ProjectReportType.INTERNAL
        ? await this.service.buildInternalReport(projectId, user)
        : await this.service.buildClientReport(projectId, user);
    return { tipo, ...data };
  }

  /** Guarda SOLO lo editable (textos, secciones, conceptos manuales, casillas). */
  @Patch(':tipo')
  async saveInforme(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('tipo') tipo: string,
    @Body() dto: UpdateProjectReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    const type = this.parseTipo(tipo);
    this.service.assertTipoPermitido(user, type);
    return this.service.saveSettings(projectId, type, dto, user);
  }

  /**
   * Archiva el PDF del informe como archivo del proyecto: aparece en la pestaña
   * Archivos y, en el siguiente ciclo del sync (≤15 min), en Nextcloud dentro de
   * "ERP/Informes".
   *
   * POST y no GET porque crea algo. Devuelve el nombre con el que quedó
   * guardado, que es lo que necesita la UI para decir dónde buscarlo.
   */
  @Post(':tipo/archivar')
  async archivarInforme(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('tipo') tipo: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ fileId: string; nombre: string }> {
    return this.service.archivarPdf(projectId, this.parseTipo(tipo), user);
  }

  @Get(':tipo/export')
  async exportInforme(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('tipo') tipo: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('format') format?: string,
  ): Promise<void> {
    const type = this.parseTipo(tipo);
    const formato = this.parseFormato(format);
    const doc = await this.service.buildDoc(projectId, type, user);
    await this.enviar(res, doc, formato);
  }

  /**
   * PDF `inline` (se abre en el visor, listo para imprimir) y Excel como
   * descarga: un .xlsx dentro del navegador no sirve de nada.
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
}
