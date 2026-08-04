import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlink } from 'fs';
import { randomUUID } from 'crypto';
import { getUploadRoot } from '../files/files.utils';
import { PriceImport, PriceImportStatus } from './entities/price-import.entity';
import { PriceImportLine, PriceImportLineStatus } from './entities/price-import-line.entity';
import { Material } from './entities/material.entity';
import { PriceSource } from './entities/material-price.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { MaterialsService } from './materials.service';
import { MaterialPricesService } from './material-prices.service';
import { PriceExtractionService } from './price-extraction.service';
import { CreatePriceImportDto } from './dto/create-price-import.dto';
import { UpdatePriceImportLineDto } from './dto/update-price-import-line.dto';
import { ApprovePriceImportDto } from './dto/approve-price-import.dto';
import { CleanExtractedLine } from './price-extraction';

/** Carpeta de los PDF de importación, relativa a la raíz de subidas. */
const IMPORTS_DIR = join('costs', 'imports');

/**
 * Importación de precios desde cotizaciones de proveedor en PDF (Fase 4).
 *
 * El ciclo es: subir → cola → extraer con IA → **revisar a mano** → aprobar. El paso de
 * revisión no es opcional ni se puede saltar por API: `approve` recibe la lista explícita
 * de líneas y ninguna otra ruta escribe en `material_prices`.
 */
@Injectable()
export class PriceImportsService {
  private readonly logger = new Logger(PriceImportsService.name);

  constructor(
    @InjectRepository(PriceImport) private readonly importsRepository: Repository<PriceImport>,
    @InjectRepository(PriceImportLine) private readonly linesRepository: Repository<PriceImportLine>,
    @InjectRepository(Supplier) private readonly suppliersRepository: Repository<Supplier>,
    private readonly materialsService: MaterialsService,
    private readonly pricesService: MaterialPricesService,
    private readonly extraction: PriceExtractionService,
  ) {}

  /**
   * Guarda el PDF y crea el lote en `pending`. NO extrae: eso lo hace el worker, que
   * puede tardar minutos y no cabe dentro de una petición HTTP.
   */
  async create(
    file: Express.Multer.File,
    dto: CreatePriceImportDto,
    createdById?: string,
  ): Promise<PriceImport> {
    if (!this.extraction.isConfigured()) {
      throw new UnprocessableEntityException(
        'La extracción por IA no está configurada (falta GEMINI_API_KEY).',
      );
    }
    if (!file) throw new BadRequestException('Falta el archivo PDF');

    // El mimetype lo declara el cliente: lo que manda es el contenido.
    if (file.buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new BadRequestException('El archivo no es un PDF');
    }

    if (dto.supplierId) {
      const exists = await this.suppliersRepository.existsBy({ id: dto.supplierId });
      if (!exists) throw new BadRequestException(`El proveedor ${dto.supplierId} no existe`);
    }

    const destDir = join(getUploadRoot(), IMPORTS_DIR);
    mkdirSync(destDir, { recursive: true });
    const filePath = join(destDir, `${randomUUID()}.pdf`);
    writeFileSync(filePath, file.buffer);

    return this.importsRepository.save(
      this.importsRepository.create({
        originalName: file.originalname,
        path: relative(getUploadRoot(), filePath),
        size: file.size,
        status: PriceImportStatus.PENDING,
        supplierId: dto.supplierId,
        notes: dto.notes,
        createdById,
      }),
    );
  }

  /**
   * Extrae las líneas de un lote. Lo llama el worker de la cola, no un controlador.
   *
   * Cualquier fallo se guarda en el propio lote (`failed` + `error`) además de
   * propagarse: si solo se propagara, el usuario vería el lote colgado en `processing`
   * para siempre sin saber por qué.
   */
  async process(importId: string): Promise<void> {
    const record = await this.findOneOrFail(importId);
    if (record.status !== PriceImportStatus.PENDING) {
      this.logger.warn(`El lote ${importId} ya no está pendiente (${record.status}); se ignora`);
      return;
    }

    await this.importsRepository.update(importId, { status: PriceImportStatus.PROCESSING });

    try {
      const absPath = join(getUploadRoot(), record.path);
      if (!existsSync(absPath)) {
        throw new UnprocessableEntityException('El PDF del lote ya no está en disco');
      }

      const result = await this.extraction.extract(readFileSync(absPath), record.originalName);
      const lines = await this.buildLines(importId, result.lines);

      if (lines.length > 0) await this.linesRepository.save(lines);

      await this.importsRepository.update(importId, {
        status: PriceImportStatus.REVIEW,
        documentDate: result.documentDate ?? undefined,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        notes: this.appendDiscarded(record.notes, result.discarded),
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Error desconocido';
      await this.importsRepository.update(importId, {
        status: PriceImportStatus.FAILED,
        error: message,
      });
      this.logger.error(`Falló la extracción del lote ${importId}: ${message}`);
      throw err;
    }
  }

  async findAll(page = 1, limit = 25) {
    const [data, total] = await this.importsRepository.findAndCount({
      relations: { supplier: true, createdBy: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<PriceImport> {
    const record = await this.importsRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        createdBy: true,
        lines: { material: { unit: true } },
      },
      order: { lines: { position: 'ASC' } },
    });
    if (!record) throw new NotFoundException(`Importación ${id} no encontrada`);
    return record;
  }

  /** Correcciones de la revisión. Los campos `raw*` no se tocan nunca. */
  async updateLine(
    importId: string,
    lineId: string,
    dto: UpdatePriceImportLineDto,
  ): Promise<PriceImportLine> {
    const line = await this.findLineOrFail(importId, lineId);

    if (line.status === PriceImportLineStatus.APPROVED) {
      throw new UnprocessableEntityException(
        'Esta línea ya generó un precio. Los precios son append-only: anula el precio y registra otro.',
      );
    }
    if (dto.status === PriceImportLineStatus.APPROVED) {
      throw new BadRequestException('Para aprobar una línea usa POST /approve, no este endpoint.');
    }

    if (dto.materialId) {
      const material = await this.materialsService.findOne(dto.materialId);
      if (!material) throw new BadRequestException(`El material ${dto.materialId} no existe`);
    }

    // `materialId: null` desasigna a propósito, así que no se puede filtrar por !== undefined
    // sin distinguir el null explícito.
    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(line, defined);

    return this.linesRepository.save(line);
  }

  /**
   * Convierte en precios reales las líneas indicadas. Es el único punto donde lo extraído
   * por la IA entra a `material_prices`, y exige lista explícita de ids.
   */
  async approve(
    importId: string,
    dto: ApprovePriceImportDto,
    userId?: string,
  ): Promise<{ created: number; skipped: { lineId: string; reason: string }[] }> {
    const record = await this.findOneOrFail(importId);
    if (record.status !== PriceImportStatus.REVIEW && record.status !== PriceImportStatus.DONE) {
      throw new UnprocessableEntityException(
        `El lote está en estado "${record.status}": todavía no hay nada que aprobar.`,
      );
    }

    const lines = await this.linesRepository.find({
      where: { id: In(dto.lineIds), importId },
    });
    const found = new Set(lines.map((l) => l.id));
    const skipped = dto.lineIds
      .filter((id) => !found.has(id))
      .map((lineId) => ({ lineId, reason: 'No pertenece a este lote' }));

    const date = dto.date?.slice(0, 10) ?? record.documentDate ?? undefined;
    let created = 0;

    for (const line of lines) {
      if (line.status === PriceImportLineStatus.APPROVED) {
        skipped.push({ lineId: line.id, reason: 'Ya estaba aprobada' });
        continue;
      }
      if (!line.materialId) {
        skipped.push({ lineId: line.id, reason: 'Sin material asignado' });
        continue;
      }

      try {
        const price = await this.pricesService.create(
          line.materialId,
          {
            price: line.price,
            currency: line.currency,
            itbisIncluded: line.itbisIncluded,
            discountPct: line.discountPct,
            supplierId: record.supplierId ?? undefined,
            date,
            source: PriceSource.SUPPLIER_QUOTE,
            notes: `Importado de "${record.originalName}" — ${line.rawDescription}`,
          },
          userId,
        );
        line.status = PriceImportLineStatus.APPROVED;
        line.createdPriceId = price.id;
        await this.linesRepository.save(line);
        created += 1;
      } catch (err) {
        // Una línea mala no puede tumbar la aprobación de las demás: se informa y sigue.
        skipped.push({ lineId: line.id, reason: (err as Error).message });
      }
    }

    await this.refreshStatus(importId);
    return { created, skipped };
  }

  /** Borra el lote y su PDF. Los precios ya aprobados NO se tocan: son append-only. */
  async remove(id: string): Promise<void> {
    const record = await this.findOneOrFail(id);
    const storedPath = record.path;
    await this.importsRepository.remove(record);

    const absPath = join(getUploadRoot(), storedPath);
    if (!existsSync(absPath)) return;
    unlink(absPath, (err) => {
      if (err) this.logger.error(`No se pudo borrar el PDF ${absPath}: ${err.message}`);
    });
  }

  /**
   * Empareja cada línea con un material del catálogo por nombre.
   *
   * Solo propone cuando el candidato es **único**: con varios candidatos, elegir "el
   * primero" convierte una duda en un dato aparentemente confirmado, que es justo lo
   * que la revisión debería atrapar y no atraparía.
   */
  private async buildLines(
    importId: string,
    extracted: CleanExtractedLine[],
  ): Promise<PriceImportLine[]> {
    const lines: PriceImportLine[] = [];

    for (const line of extracted) {
      let candidates: Material[] = [];
      try {
        candidates = await this.materialsService.findSimilar(line.rawDescription, 5);
      } catch (err) {
        this.logger.warn(
          `No se pudo emparejar "${line.rawDescription}": ${(err as Error).message}`,
        );
      }

      lines.push(
        this.linesRepository.create({
          importId,
          position: line.position,
          rawDescription: line.rawDescription,
          rawCode: line.rawCode ?? undefined,
          rawUnit: line.rawUnit ?? undefined,
          price: line.price,
          currency: line.currency,
          itbisIncluded: line.itbisIncluded,
          discountPct: line.discountPct,
          materialId: candidates.length === 1 ? candidates[0].id : undefined,
          matchCount: candidates.length,
          status: PriceImportLineStatus.PENDING,
        }),
      );
    }

    return lines;
  }

  /** Un lote pasa a `done` cuando no le queda ninguna línea sin resolver. */
  private async refreshStatus(importId: string): Promise<void> {
    const pending = await this.linesRepository.countBy({
      importId,
      status: PriceImportLineStatus.PENDING,
    });
    await this.importsRepository.update(importId, {
      status: pending === 0 ? PriceImportStatus.DONE : PriceImportStatus.REVIEW,
    });
  }

  private appendDiscarded(notes: string | null, discarded: string[]): string | undefined {
    if (discarded.length === 0) return notes ?? undefined;
    const block = [`Líneas descartadas en la extracción (${discarded.length}):`, ...discarded].join(
      '\n',
    );
    return notes ? `${notes}\n\n${block}` : block;
  }

  private async findOneOrFail(id: string): Promise<PriceImport> {
    const record = await this.importsRepository.findOneBy({ id });
    if (!record) throw new NotFoundException(`Importación ${id} no encontrada`);
    return record;
  }

  private async findLineOrFail(importId: string, lineId: string): Promise<PriceImportLine> {
    const line = await this.linesRepository.findOneBy({ id: lineId, importId });
    if (!line) throw new NotFoundException(`Línea ${lineId} no encontrada en el lote ${importId}`);
    return line;
  }
}
