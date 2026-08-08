import { ForbiddenException } from '@nestjs/common';
import { ProjectReportService } from './project-report.service';
import { ProjectReportType } from './entities/project-report.entity';
import { FileContext } from '../files/entities/file-upload.entity';
import { UserRole } from '../users/entities/user.entity';

/**
 * Archivar un informe (botón "Guardar en el proyecto") escribe un archivo en el
 * proyecto, y subir archivos es MANAGER+ en todo el ERP. Esa guardia se prueba
 * aquí y no contra la API real porque el `ResourceAccessGuard` corta antes por
 * ámbito: un USER sin acceso al proyecto recibe 404 y nunca llega a tocar esta
 * comprobación, así que probarlo por HTTP daba un falso verde.
 *
 * El caso que importa es el otro: un USER que SÍ tiene acceso al proyecto
 * —puede abrir el informe de cliente y verlo— tampoco puede archivarlo.
 */

function servicio(overrides: Partial<Record<string, unknown>> = {}) {
  const guardados: unknown[] = [];

  const files = {
    saveGeneratedFile: (params: unknown) => {
      guardados.push(params);
      return Promise.resolve({ id: 'file-1' });
    },
  };

  const svc = new ProjectReportService(
    { findOne: () => Promise.resolve(null), save: (x: unknown) => Promise.resolve(x) } as never,
    {
      findOne: () =>
        Promise.resolve({
          id: 'p1',
          code: 'PRJ-2026-001',
          clientId: 'c1',
          client: { name: 'Cliente' },
        }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { count: () => Promise.resolve(0) } as never,
    {} as never,
    {} as never,
    { assertProjectAccess: () => Promise.resolve(undefined) } as never,
    files as never,
    { getCompanyData: () => Promise.resolve({ name: 'STP' }) } as never,
  );

  Object.assign(svc, overrides);
  return { svc, guardados, files };
}

describe('ProjectReportService.archivarPdf — permisos', () => {
  it('un USER con acceso al proyecto NO puede archivar el informe de cliente', async () => {
    const { svc } = servicio();

    await expect(
      svc.archivarPdf('p1', ProjectReportType.CLIENT, {
        id: 'u1',
        role: UserRole.USER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un USER tampoco puede archivar el informe interno', async () => {
    const { svc } = servicio();

    await expect(
      svc.archivarPdf('p1', ProjectReportType.INTERNAL, {
        id: 'u1',
        role: UserRole.USER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un MANAGER archiva en el contexto project-reports, con nombre fechado', async () => {
    const { svc, guardados } = servicio({
      // El PDF real se compone en report-export, que ya tiene sus propias
      // pruebas; aquí solo interesa qué se archiva y con qué metadatos.
      buildDoc: () => Promise.resolve({ title: 'x', filters: [], tables: [], filename: 'x' }),
    });

    const res = await svc.archivarPdf('p1', ProjectReportType.CLIENT, {
      id: 'u1',
      role: UserRole.MANAGER,
    });

    expect(guardados).toHaveLength(1);
    const params = guardados[0] as {
      context: FileContext;
      displayName: string;
      clientId: string;
      mimetype: string;
    };
    expect(params.context).toBe(FileContext.PROJECT_REPORTS);
    expect(params.mimetype).toBe('application/pdf');
    expect(params.clientId).toBe('c1');
    // "Informe de cliente - PRJ-2026-001 - 2026-08-08.pdf"
    expect(params.displayName).toMatch(
      /^Informe de cliente - PRJ-2026-001 - \d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(res.nombre).toBe(params.displayName);
  });
});
