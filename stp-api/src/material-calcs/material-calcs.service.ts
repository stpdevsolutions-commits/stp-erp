import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { join } from 'path';
import { existsSync } from 'fs';
import { MaterialCalc } from './entities/material-calc.entity';
import { CalcMaterialLink } from './entities/calc-material-link.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { FileContext } from '../files/entities/file-upload.entity';
import { FilesService } from '../files/files.service';
import { getUploadRoot } from '../files/files.utils';
import { MaterialsService } from '../costs/materials.service';
import { SettingsService } from '../settings/settings.service';
import { AccessControlService } from '../common/access/access-control.service';
import { docToPdf } from '../reports/report-export';
import { CreateMaterialCalcDto } from './dto/material-calc.dto';
import { calcDoc, consolidar, MaterialPrecio, parseResultado, valorar } from './material-calc-doc';

const TZ = 'America/Santo_Domingo';

/** "2026-09-25 01:08" en hora de RD (sv-SE da el formato ISO sin la T). */
function fechaRD(d: Date): string {
  return d.toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16);
}

@Injectable()
export class MaterialCalcsService {
  constructor(
    @InjectRepository(MaterialCalc) private readonly calcs: Repository<MaterialCalc>,
    @InjectRepository(CalcMaterialLink) private readonly links: Repository<CalcMaterialLink>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly materials: MaterialsService,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
    private readonly access: AccessControlService,
  ) {}

  // ── Enlaces insumo → material del catálogo ──────────────────────────────

  /** Material y precio vigente de cada clave enlazada (todas, o solo `claves`). */
  private async enlaces(claves?: string[]): Promise<Map<string, MaterialPrecio & { code: string; fecha: string | null }>> {
    const rows = await this.links.find(claves ? { where: { clave: In(claves) } } : {});
    const mats = await this.materials.findManyWithPrices([...new Set(rows.map((r) => r.materialId))]);
    const porId = new Map(mats.map((m) => [m.id, m]));
    const out = new Map<string, MaterialPrecio & { code: string; fecha: string | null }>();
    for (const r of rows) {
      const m = porId.get(r.materialId);
      if (!m) continue;
      out.set(r.clave, {
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit?.name ?? m.unit?.code ?? null,
        precio: m.priceSummary?.current ?? null,
        fecha: m.priceSummary?.currentDate ?? null,
      });
    }
    return out;
  }

  /** Para la app: qué insumos tienen material enlazado y a qué precio. */
  async getLinks() {
    const map = await this.enlaces();
    return [...map.entries()].map(([clave, m]) => ({
      clave,
      materialId: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      precio: m.precio,
      precioFecha: m.fecha,
    }));
  }

  async setLink(clave: string, materialId: string, user: User) {
    await this.materials.findOne(materialId); // 404 si no existe
    await this.links.save({ clave, materialId, updatedById: user.id });
    return (await this.getLinks()).find((l) => l.clave === clave);
  }

  async deleteLink(clave: string) {
    await this.links.delete({ clave });
    return { ok: true };
  }

  // ── Cálculos guardados ──────────────────────────────────────────────────

  /**
   * Guarda el cálculo en el proyecto: valora la lista con el catálogo (en el
   * servidor — no se confía en precios que mande el teléfono), genera el PDF
   * y lo archiva en los documentos del proyecto. La pertenencia al proyecto
   * ya la comprobó ResourceAccessGuard.
   */
  async create(dto: CreateMaterialCalcDto, user: User) {
    const project = await this.projects.findOne({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const resultado = parseResultado(dto.result);
    const consolidada = consolidar(resultado);
    const enlaces = await this.enlaces([...new Set(consolidada.map((l) => l.clave))]);
    const { lineas, total } = valorar(consolidada, enlaces);

    const ahora = new Date();
    const fecha = fechaRD(ahora);
    const autor = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    const nombre = `Cálculo - ${dto.title} - ${project.code} - ${fecha.replace(':', '-')}.pdf`;

    const doc = calcDoc({
      title: dto.title,
      projectLabel: `${project.code} — ${project.name}`,
      fecha,
      autor,
      resultado,
      lista: lineas,
      total,
      filename: nombre.replace(/\.pdf$/, ''),
    });
    const buffer = await docToPdf(doc, await this.settings.getCompanyData());

    const file = await this.files.saveGeneratedFile({
      buffer,
      displayName: nombre,
      mimetype: 'application/pdf',
      context: FileContext.PROJECT_DOCUMENTS,
      clientId: project.clientId,
      projectId: project.id,
      uploadedById: user.id,
    });

    const saved = await this.calcs.save(
      this.calcs.create({
        projectId: project.id,
        calculatorId: dto.calculatorId,
        title: dto.title,
        inputs: dto.inputs,
        result: { ...resultado, lista: lineas },
        totalMaterials: total,
        fileId: file.id,
        createdById: user.id,
      }),
    );
    return this.findOne(saved.id, user);
  }

  /** Cálculos de un proyecto, más recientes primero (sin el detalle, que pesa). */
  async findAll(projectId: string) {
    const rows = await this.calcs.find({
      where: { projectId },
      relations: { createdBy: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      calculatorId: c.calculatorId,
      title: c.title,
      totalMaterials: c.totalMaterials,
      fileId: c.fileId,
      createdAt: c.createdAt,
      createdBy: c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}`.trim() : null,
    }));
  }

  async findOne(id: string, user: User) {
    const c = await this.calcs.findOne({ where: { id }, relations: { project: true, createdBy: true } });
    if (!c) throw new NotFoundException('Cálculo no encontrado');
    await this.access.assertProjectAccess(user, c.projectId);
    return {
      id: c.id,
      projectId: c.projectId,
      project: { id: c.project.id, code: c.project.code, name: c.project.name },
      calculatorId: c.calculatorId,
      title: c.title,
      inputs: c.inputs,
      result: c.result,
      totalMaterials: c.totalMaterials,
      fileId: c.fileId,
      createdAt: c.createdAt,
      createdBy: c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}`.trim() : null,
    };
  }

  /** Ruta en disco y nombre del PDF archivado de un cálculo. */
  async getPdf(id: string, user: User): Promise<{ path: string; name: string }> {
    const c = await this.calcs.findOne({ where: { id }, relations: { file: true } });
    if (!c) throw new NotFoundException('Cálculo no encontrado');
    await this.access.assertProjectAccess(user, c.projectId);
    if (!c.file) throw new NotFoundException('El PDF de este cálculo ya no existe');
    const abs = join(getUploadRoot(), c.file.path);
    if (!existsSync(abs)) throw new NotFoundException('El PDF de este cálculo ya no existe');
    return { path: abs, name: c.file.originalName };
  }
}
