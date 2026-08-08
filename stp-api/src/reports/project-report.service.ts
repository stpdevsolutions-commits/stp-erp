import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';
import { hasUnrestrictedAccess } from '../common/access/access-policy';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Ficha } from '../fichas/entities/ficha.entity';
import { FileUpload, FileContext } from '../files/entities/file-upload.entity';
import { PayrollEntry, PayrollStatus } from '../payroll/entities/payroll-entry.entity';
import { ReportsService } from './reports.service';
import {
  ProjectReport,
  ProjectReportType,
  type ProjectReportInclude,
} from './entities/project-report.entity';
import type { UpdateProjectReportDto } from './dto/update-project-report.dto';
import { FilesService } from '../files/files.service';
import { SettingsService } from '../settings/settings.service';
import { docToPdf } from './report-export';
import {
  buildClientProjectDoc,
  buildInternalProjectDoc,
  type ClientProjectReportShape,
  type InternalProjectReportShape,
  type ProjectReportSettingsShape,
} from './project-report-tables';
import type { ExportDoc } from './report-tables';

/**
 * Informes de proyecto: la parte editable (persistida) y el armado de los dos
 * documentos.
 *
 * REGLA DE ORO DEL MÓDULO: `buildClientReport()` no toca los repositorios de
 * gastos ni de nómina. No es que filtre esos datos al pintar — es que nunca los
 * pide. Si algún día alguien necesita un dato económico en el informe de
 * cliente, tendrá que añadir la consulta a mano y verá este comentario primero.
 */
@Injectable()
export class ProjectReportService {
  constructor(
    @InjectRepository(ProjectReport)
    private readonly reportsRepo: Repository<ProjectReport>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Ficha)
    private readonly fichasRepo: Repository<Ficha>,
    @InjectRepository(FileUpload)
    private readonly filesRepo: Repository<FileUpload>,
    @InjectRepository(PayrollEntry)
    private readonly payrollRepo: Repository<PayrollEntry>,
    private readonly reportsService: ReportsService,
    private readonly access: AccessControlService,
    // Para archivar el informe como archivo del proyecto (botón "Guardar en el
    // proyecto"): de ahí sale solo a Nextcloud, vía el sync de erp-named.
    private readonly files: FilesService,
    private readonly settingsService: SettingsService,
  ) {}

  // ── Acceso ────────────────────────────────────────────────────────────────

  /**
   * El informe INTERNO lleva nómina (sueldos de personas). El módulo payroll es
   * MANAGER+ incluso en lectura, así que este informe hereda esa regla: un USER
   * no lo ve ni aunque el proyecto sea suyo. El de cliente sí, con el acotado
   * por pertenencia de siempre (`ResourceAccessGuard` + revalidación aquí).
   */
  assertTipoPermitido(user: AccessSubject | undefined, type: ProjectReportType): void {
    if (type !== ProjectReportType.INTERNAL) return;
    if (!user || !hasUnrestrictedAccess(user.role)) {
      throw new ForbiddenException(
        'El informe interno incluye nómina y márgenes: requiere rol MANAGER o ADMIN',
      );
    }
  }

  // ── Parte editable ────────────────────────────────────────────────────────

  /**
   * Casillas por defecto la primera vez que se abre un informe.
   * El interno enseña la economía completa; el de cliente, la obra.
   */
  static defaultInclude(type: ProjectReportType): ProjectReportInclude {
    const cliente = type === ProjectReportType.CLIENT;
    return {
      detalleGastos: !cliente,
      nomina: !cliente,
      tareas: true,
      fichas: cliente,
      fotos: cliente,
      cronologia: true,
      conceptosManuales: true,
    };
  }

  /** La fila guardada, o una en blanco (no persistida) si aún no existe. */
  async getSettings(projectId: string, type: ProjectReportType): Promise<ProjectReport> {
    const found = await this.reportsRepo.findOne({ where: { projectId, type } });
    if (found) return found;
    return this.reportsRepo.create({
      projectId,
      type,
      sections: [],
      manualItems: [],
      include: {},
    });
  }

  /**
   * Guarda la parte editable. Upsert por (proyecto, tipo): una sola fila por
   * informe, así que reimprimir nunca obliga a reescribir las observaciones.
   */
  async saveSettings(
    projectId: string,
    type: ProjectReportType,
    dto: UpdateProjectReportDto,
    user?: AccessSubject,
  ): Promise<ProjectReport> {
    await this.assertProjectExists(projectId, user);

    const entity =
      (await this.reportsRepo.findOne({ where: { projectId, type } })) ??
      this.reportsRepo.create({
        projectId,
        type,
        sections: [],
        manualItems: [],
        include: ProjectReportService.defaultInclude(type),
      });

    // Object.assign defensivo: con `useDefineForClassFields` los campos
    // opcionales del DTO existen con valor `undefined` y borrarían lo guardado.
    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(entity, defined);

    // Las listas se normalizan: cada elemento con id propio para que el frontend
    // pueda reordenar y borrar sin ambigüedad.
    if (dto.sections !== undefined) {
      entity.sections = (dto.sections ?? []).map((s, i) => ({
        id: s.id || `sec-${i + 1}-${Date.now()}`,
        title: s.title ?? '',
        body: s.body ?? '',
      }));
    }
    if (dto.manualItems !== undefined) {
      entity.manualItems = (dto.manualItems ?? []).map((m, i) => ({
        id: m.id || `man-${i + 1}-${Date.now()}`,
        description: m.description ?? '',
        amount: Number(m.amount) || 0,
        ...(m.notes ? { notes: m.notes } : {}),
      }));
    }
    if (dto.include !== undefined) {
      // Fusión, no reemplazo: el frontend puede mandar solo la casilla tocada.
      entity.include = { ...(entity.include ?? {}), ...dto.include };
    }

    if (user?.id) entity.updatedById = user.id;
    return this.reportsRepo.save(entity);
  }

  // ── Armado de los documentos ──────────────────────────────────────────────

  /**
   * INFORME INTERNO — toda la economía del proyecto.
   *
   * Las agregaciones base (tareas por estado, gastos por categoría, cobros,
   * balance, % de presupuesto) NO se reescriben: salen de
   * `ReportsService.getProjectSummary`, que ya es la única fuente de esas
   * cifras. Aquí solo se le añade el detalle que un informe necesita y el
   * resumen no da (línea a línea de gastos, desglose de nómina, cobros).
   */
  async buildInternalReport(
    projectId: string,
    user?: AccessSubject,
  ): Promise<InternalProjectReportShape> {
    this.assertTipoPermitido(user, ProjectReportType.INTERNAL);

    const summary = await this.reportsService.getProjectSummary(projectId, user);
    const settings = await this.getSettings(projectId, ProjectReportType.INTERNAL);
    const include = this.mergeInclude(settings, ProjectReportType.INTERNAL);

    const [expenseRows, payrollRows, paymentRows] = await Promise.all([
      include.detalleGastos
        ? this.expensesRepo.find({
            where: { projectId },
            relations: { supplier: true },
            order: { date: 'ASC' },
          })
        : Promise.resolve([] as Expense[]),

      include.nomina
        ? this.payrollRepo.find({
            where: { projectId, status: PayrollStatus.PAID },
            relations: { collaborator: true },
            order: { periodStart: 'ASC' },
          })
        : Promise.resolve([] as PayrollEntry[]),

      include.cronologia
        ? this.paymentsRepo.find({
            where: { projectId, status: PaymentStatus.COMPLETED },
            order: { date: 'ASC' },
          })
        : Promise.resolve([] as Payment[]),
    ]);

    return {
      project: {
        code: summary.project.code,
        name: summary.project.name,
        status: summary.project.status,
        budget: summary.project.budget ?? undefined,
        startDate: summary.project.startDate,
        endDate: summary.project.endDate,
        location: summary.project.location,
        client: summary.project.client ? { name: summary.project.client.name } : undefined,
      },
      settings: this.toSettingsShape(settings, include),
      tasks: summary.tasks,
      expenses: {
        total: summary.expenses.total,
        byCategory: summary.expenses.byCategory,
        budgetUsed: summary.expenses.budgetUsed,
        detail: expenseRows.map((e) => ({
          date: e.date,
          description: e.description,
          category: e.category,
          supplier: e.supplier?.name,
          amount: e.amount ?? 0,
        })),
      },
      payroll: {
        // Suma informativa: este importe YA está dentro de `expenses.byCategory.labor`
        // (payroll genera el gasto al marcar el pago como pagado). Se muestra
        // para saber a quién se pagó, nunca para sumarlo otra vez.
        total: payrollRows.reduce((a, n) => a + (n.grossAmount ?? 0), 0),
        entries: payrollRows.map((n) => ({
          number: n.number,
          collaborator: n.collaborator
            ? `${n.collaborator.firstName} ${n.collaborator.lastName}`.trim()
            : '—',
          periodStart: n.periodStart,
          periodEnd: n.periodEnd,
          days: n.daysWorked ?? null,
          gross: n.grossAmount ?? 0,
        })),
      },
      payments: {
        total: summary.payments.total,
        detail: paymentRows.map((p) => ({
          date: p.date,
          description: p.description,
          method: p.method,
          amount: p.amount ?? 0,
        })),
      },
      balance: summary.balance,
    };
  }

  /**
   * INFORME DE CLIENTE — avance de obra, actividades, fichas, fotos y sus pagos.
   *
   * ⚠️ Este método NO consulta gastos, nómina, presupuesto ni margen, y no
   * llama a `getProjectSummary` (que los trae). Todo lo que devuelve es
   * información que el cliente ya conoce o que es suya. No añadas aquí una
   * consulta económica: el tipo de retorno tampoco tiene dónde ponerla.
   */
  async buildClientReport(
    projectId: string,
    user?: AccessSubject,
  ): Promise<ClientProjectReportShape> {
    const project = await this.assertProjectExists(projectId, user);
    const settings = await this.getSettings(projectId, ProjectReportType.CLIENT);
    const include = this.mergeInclude(settings, ProjectReportType.CLIENT);

    const [tasks, fichas, photos, receipts] = await Promise.all([
      this.tasksRepo.find({ where: { projectId }, order: { dueDate: 'ASC', createdAt: 'ASC' } }),

      include.fichas
        ? this.fichasRepo.find({ where: { projectId }, order: { createdAt: 'ASC' } })
        : Promise.resolve([] as Ficha[]),

      include.fotos
        ? this.filesRepo.find({
            where: { projectId, context: FileContext.PROJECT_PHOTOS },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([] as FileUpload[]),

      include.cronologia
        ? this.paymentsRepo.find({
            where: { projectId, status: PaymentStatus.COMPLETED },
            order: { date: 'ASC' },
          })
        : Promise.resolve([] as Payment[]),
    ]);

    // El avance sale de las tareas: las canceladas no cuentan ni arriba ni abajo,
    // porque si no una obra terminada con tareas anuladas nunca llega al 100 %.
    const vivas = tasks.filter((t) => t.status !== 'cancelled');
    const hechas = vivas.filter((t) => t.status === 'done').length;
    const percent = vivas.length > 0 ? Math.round((hechas / vivas.length) * 1000) / 10 : 0;

    return {
      project: {
        code: project.code,
        name: project.name,
        status: project.status,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        location: project.location,
        client: project.client ? { name: project.client.name } : undefined,
      },
      settings: this.toSettingsShape(settings, include),
      progress: { total: vivas.length, done: hechas, percent },
      tasks: include.tareas
        ? tasks.map((t) => ({
            title: t.title,
            status: t.status,
            dueDate: t.dueDate,
            completedAt: t.completedAt,
          }))
        : [],
      fichas: fichas.map((f) => ({
        code: f.code,
        type: f.type,
        status: f.status,
        date: f.submittedAt ?? f.createdAt,
      })),
      photos: photos.map((f) => ({ name: f.originalName, date: f.createdAt })),
      receipts: receipts.map((p) => ({
        date: p.date,
        description: p.description,
        method: p.method,
        amount: p.amount ?? 0,
      })),
    };
  }

  /** Documento listo para exportar (PDF o Excel salen de aquí, iguales). */
  async buildDoc(
    projectId: string,
    type: ProjectReportType,
    user?: AccessSubject,
  ): Promise<ExportDoc> {
    if (type === ProjectReportType.INTERNAL) {
      return buildInternalProjectDoc(await this.buildInternalReport(projectId, user));
    }
    return buildClientProjectDoc(await this.buildClientReport(projectId, user));
  }

  /**
   * Genera el PDF del informe y lo archiva como archivo del proyecto.
   *
   * Se dispara desde el botón "Guardar en el proyecto", no al exportar: ver el
   * PDF es una vista previa y no debe dejar rastro, archivarlo es una decisión.
   *
   * Se acumula historial en vez de sobrescribir (decisión de Ángel, 08/08): cada
   * guardado deja su propio archivo fechado, de modo que lo que se le entregó al
   * cliente en marzo se puede seguir abriendo en agosto aunque las cifras del
   * proyecto hayan cambiado. Es la única copia del informe que queda congelada:
   * el resto se recalcula en cada impresión.
   */
  async archivarPdf(
    projectId: string,
    type: ProjectReportType,
    user: AccessSubject & { id: string },
  ): Promise<{ fileId: string; nombre: string }> {
    this.assertTipoPermitido(user, type);
    if (!hasUnrestrictedAccess(user.role)) {
      throw new ForbiddenException(
        'Archivar un informe guarda un archivo en el proyecto: requiere rol MANAGER o ADMIN',
      );
    }

    const project = await this.assertProjectExists(projectId, user);
    const doc = await this.buildDoc(projectId, type, user);
    const company = await this.settingsService.getCompanyData();
    const buffer = await docToPdf(doc, company);

    const nombre = await this.nombreArchivo(projectId, type, project.code);

    const saved = await this.files.saveGeneratedFile({
      buffer,
      displayName: nombre,
      mimetype: 'application/pdf',
      context: FileContext.PROJECT_REPORTS,
      clientId: project.clientId,
      projectId,
      uploadedById: user.id,
    });

    return { fileId: saved.id, nombre };
  }

  /**
   * "Informe de cliente - PRJ-2026-001 - 2026-08-08.pdf".
   *
   * Si ya se archivó uno igual ese mismo día se le añade la hora, en vez de
   * dejar dos archivos con nombre idéntico que solo se distinguen abriéndolos.
   */
  private async nombreArchivo(
    projectId: string,
    type: ProjectReportType,
    code: string,
  ): Promise<string> {
    const etiqueta = type === ProjectReportType.INTERNAL ? 'Informe interno' : 'Informe de cliente';
    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10);
    const base = `${etiqueta} - ${code} - ${fecha}`;

    const yaExiste = await this.filesRepo.count({
      where: {
        projectId,
        context: FileContext.PROJECT_REPORTS,
        originalName: `${base}.pdf`,
      },
    });
    if (yaExiste === 0) return `${base}.pdf`;

    const hora = ahora.toISOString().slice(11, 16).replace(':', '-');
    return `${base} ${hora}.pdf`;
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  private mergeInclude(
    settings: ProjectReport,
    type: ProjectReportType,
  ): ProjectReportInclude {
    return {
      ...ProjectReportService.defaultInclude(type),
      ...(settings.include ?? {}),
    };
  }

  private toSettingsShape(
    settings: ProjectReport,
    include: ProjectReportInclude,
  ): ProjectReportSettingsShape {
    return {
      title: settings.title ?? undefined,
      intro: settings.intro ?? undefined,
      observations: settings.observations ?? undefined,
      conclusions: settings.conclusions ?? undefined,
      sections: settings.sections ?? [],
      manualItems: settings.manualItems ?? [],
      include,
    };
  }

  /**
   * El acceso al proyecto lo garantiza `@ScopedResource('project')`; se
   * revalida aquí por defensa en profundidad (404 si no procede).
   */
  private async assertProjectExists(projectId: string, user?: AccessSubject): Promise<Project> {
    await this.access.assertProjectAccess(user, projectId);
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
      relations: { client: true },
    });
    if (!project) throw new NotFoundException(`Proyecto ${projectId} no encontrado`);
    return project;
  }
}
