import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Acu } from './entities/acu.entity';
import { AcuItem } from './entities/acu-item.entity';
import { Unit } from './entities/unit.entity';
import { Material } from './entities/material.entity';
import { MaterialPrice } from './entities/material-price.entity';
import { CreateAcuDto, AcuItemDto } from './dto/create-acu.dto';
import { UpdateAcuDto } from './dto/update-acu.dto';
import { QueryAcusDto } from './dto/query-acus.dto';
import { normalizeMaterialName, pickCurrentPrice } from './price-selection';
import {
  computeAcuCost,
  convertQuantity,
  AcuCost,
  AcuItemInput,
  CurrentPriceMap,
} from './acu-cost';

export type AcuWithCost = Acu & { cost?: AcuCost };

@Injectable()
export class AcusService {
  constructor(
    @InjectRepository(Acu) private readonly acusRepository: Repository<Acu>,
    @InjectRepository(AcuItem) private readonly itemsRepository: Repository<AcuItem>,
    @InjectRepository(Unit) private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(Material) private readonly materialsRepository: Repository<Material>,
    @InjectRepository(MaterialPrice) private readonly pricesRepository: Repository<MaterialPrice>,
  ) {}

  // ------------------------------------------------------------------ ACU

  async create(dto: CreateAcuDto): Promise<Acu> {
    await this.assertUnitExists(dto.unitId);
    const normalizedName = normalizeMaterialName(dto.name);
    if (await this.acusRepository.existsBy({ normalizedName })) {
      throw new ConflictException(`Ya existe una partida con el nombre "${dto.name}"`);
    }

    const acu = await this.acusRepository.save(
      this.acusRepository.create({
        name: dto.name,
        description: dto.description,
        unitId: dto.unitId,
        trade: dto.trade,
        chapter: dto.chapter,
        notes: dto.notes,
        normalizedName,
        code: await this.generateCode(),
      }),
    );

    for (const [i, item] of (dto.items ?? []).entries()) {
      await this.addItem(acu.id, { sortOrder: i, ...item });
    }
    return this.findOne(acu.id);
  }

  async findAll(query: QueryAcusDto) {
    const { search, trade, chapter, unitId, isActive, withCost, page = 1, limit = 20 } = query;

    const qb = this.acusRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.unit', 'unit');

    if (trade) qb.andWhere('a.trade = :trade', { trade });
    if (chapter) qb.andWhere('a.chapter = :chapter', { chapter });
    if (unitId) qb.andWhere('a.unitId = :unitId', { unitId });
    if (isActive !== undefined) {
      qb.andWhere('a.isActive = :isActive', { isActive: isActive === 'true' });
    }
    if (search) {
      const term = `%${search}%`;
      const normalized = `%${normalizeMaterialName(search)}%`;
      qb.andWhere(
        '(a.name ILIKE :term OR a.normalizedName ILIKE :normalized OR a.code ILIKE :term OR a.chapter ILIKE :term)',
        { term, normalized },
      );
    }

    const [data, total] = await qb
      .orderBy('a.chapter', 'ASC')
      .addOrderBy('a.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (withCost !== 'true' || data.length === 0) return { data, total, page, limit };

    // Una sola pasada de precios para todo el lote: valorar N partidas de a una
    // dispararía N consultas de precios sobre la misma tabla.
    const items = await this.itemsRepository.find({
      where: { acuId: In(data.map((a) => a.id)) },
      order: { sortOrder: 'ASC' },
    });
    const prices = await this.currentPrices(items);
    const porAcu = new Map<string, AcuItem[]>();
    for (const it of items) {
      porAcu.set(it.acuId, [...(porAcu.get(it.acuId) ?? []), it]);
    }

    const conCosto: AcuWithCost[] = await Promise.all(
      data.map(async (a) => ({
        ...a,
        cost: computeAcuCost(await this.toInputs(porAcu.get(a.id) ?? []), prices),
      })),
    );
    return { data: conCosto, total, page, limit };
  }

  async findOne(id: string): Promise<Acu> {
    const acu = await this.acusRepository.findOne({
      where: { id },
      relations: { unit: true, items: { material: true, unit: true } },
    });
    if (!acu) throw new NotFoundException('Partida (ACU) no encontrada');
    acu.items = (acu.items ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    return acu;
  }

  async update(id: string, dto: UpdateAcuDto): Promise<Acu> {
    const acu = await this.findOne(id);
    if (dto.unitId && dto.unitId !== acu.unitId) await this.assertUnitExists(dto.unitId);

    if (dto.name && normalizeMaterialName(dto.name) !== acu.normalizedName) {
      const normalizedName = normalizeMaterialName(dto.name);
      if (await this.acusRepository.existsBy({ normalizedName })) {
        throw new ConflictException(`Ya existe una partida con el nombre "${dto.name}"`);
      }
      acu.normalizedName = normalizedName;
    }

    // `useDefineForClassFields` convierte los campos ausentes del DTO en `undefined`
    // propios; asignarlos sin filtrar borraría valores buenos (ver CLAUDE.md).
    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(acu, defined);
    await this.acusRepository.save(acu);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const acu = await this.findOne(id);
    await this.acusRepository.remove(acu); // CASCADE se lleva sus líneas
  }

  // ------------------------------------------------------------------ receta

  async addItem(acuId: string, dto: AcuItemDto & { sortOrder?: number }): Promise<AcuItem> {
    await this.findOne(acuId);
    const datos = await this.validateItem(dto);
    const sortOrder =
      dto.sortOrder ?? (await this.itemsRepository.count({ where: { acuId } }));
    return this.itemsRepository.save(
      this.itemsRepository.create({ ...datos, acuId, sortOrder }),
    );
  }

  async updateItem(acuId: string, itemId: string, dto: AcuItemDto): Promise<AcuItem> {
    const item = await this.itemsRepository.findOne({ where: { id: itemId, acuId } });
    if (!item) throw new NotFoundException('Línea de la receta no encontrada');

    const fusionado = {
      kind: dto.kind ?? item.kind,
      materialId: dto.materialId !== undefined ? dto.materialId : item.materialId,
      description: dto.description !== undefined ? dto.description : item.description,
      unitId: dto.unitId !== undefined ? dto.unitId : item.unitId,
      quantity: dto.quantity !== undefined ? dto.quantity : item.quantity,
      unitCost: dto.unitCost !== undefined ? dto.unitCost : item.unitCost,
      basis: dto.basis !== undefined ? dto.basis : item.basis,
      pct: dto.pct !== undefined ? dto.pct : item.pct,
      wastePct: dto.wastePct !== undefined ? dto.wastePct : item.wastePct,
    } as AcuItemDto;

    // Se revalida la línea COMPLETA, no solo lo que llegó: un PATCH que solo cambia
    // `kind` puede dejar incoherente lo que ya estaba guardado.
    const datos = await this.validateItem(fusionado);
    Object.assign(item, datos);
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.notes !== undefined) item.notes = dto.notes;
    return this.itemsRepository.save(item);
  }

  async removeItem(acuId: string, itemId: string): Promise<void> {
    const item = await this.itemsRepository.findOne({ where: { id: itemId, acuId } });
    if (!item) throw new NotFoundException('Línea de la receta no encontrada');
    await this.itemsRepository.remove(item);
  }

  // ------------------------------------------------------------------ costo

  /** Valora la partida con los precios vigentes de HOY. */
  async cost(id: string): Promise<{ acu: Acu; cost: AcuCost }> {
    const acu = await this.findOne(id);
    const prices = await this.currentPrices(acu.items ?? []);
    return { acu, cost: computeAcuCost(await this.toInputs(acu.items ?? []), prices) };
  }

  /**
   * Valora VARIAS partidas de una vez. Existe para el puente con cotizaciones: comparar
   * las líneas de una cotización contra sus ACU de una en una dispararía tres consultas
   * por línea sobre las mismas tablas.
   *
   * Los ids que no existen simplemente no aparecen en el mapa; el llamador decide qué
   * hacer con ellos (nunca se devuelve un costo inventado).
   */
  async costsByIds(ids: string[]): Promise<Map<string, { acu: Acu; cost: AcuCost }>> {
    const unicos = [...new Set(ids)];
    const out = new Map<string, { acu: Acu; cost: AcuCost }>();
    if (unicos.length === 0) return out;

    const acus = await this.acusRepository.find({
      where: { id: In(unicos) },
      relations: { unit: true },
    });
    if (acus.length === 0) return out;

    const items = await this.itemsRepository.find({
      where: { acuId: In(acus.map((a) => a.id)) },
      order: { sortOrder: 'ASC' },
    });
    const prices = await this.currentPrices(items);
    const inputs = await this.toInputs(items); // mismo orden que `items`

    const porAcu = new Map<string, AcuItemInput[]>();
    items.forEach((item, i) => {
      porAcu.set(item.acuId, [...(porAcu.get(item.acuId) ?? []), inputs[i]]);
    });

    for (const acu of acus) {
      out.set(acu.id, { acu, cost: computeAcuCost(porAcu.get(acu.id) ?? [], prices) });
    }
    return out;
  }

  // ------------------------------------------------------------------ interno

  /**
   * Precio vigente (`netUnitPrice`) de cada material de la receta.
   *
   * Se traen todos los precios no anulados y decide `pickCurrentPrice`, en vez de un
   * `ORDER BY date DESC LIMIT 1` en SQL: el vigente es el más reciente por `date` con
   * desempate por `createdAt`, y esa regla ya vive —y está probada— en un solo sitio.
   */
  private async currentPrices(items: AcuItem[]): Promise<CurrentPriceMap> {
    const ids = [...new Set(items.filter((i) => i.materialId).map((i) => i.materialId))];
    if (ids.length === 0) return new Map();

    const filas = await this.pricesRepository.find({
      where: { materialId: In(ids), voidedAt: IsNull() },
    });

    const porMaterial = new Map<string, MaterialPrice[]>();
    for (const p of filas) {
      porMaterial.set(p.materialId, [...(porMaterial.get(p.materialId) ?? []), p]);
    }

    const out: CurrentPriceMap = new Map();
    for (const [materialId, lista] of porMaterial) {
      const vigente = pickCurrentPrice(lista);
      if (vigente) out.set(materialId, vigente.netUnitPrice);
    }
    return out;
  }

  /**
   * Pasa las líneas guardadas al formato de la lógica pura, convirtiendo la cantidad a
   * la unidad del material cuando la receta usa otra (pies de cable contra un catálogo
   * en metros). La conversión se valida al guardar, así que aquí no puede fallar; si
   * aun así fallara se deja la cantidad sin tocar y el precio del catálogo se ignora,
   * antes que multiplicar por un factor inventado.
   */
  private async toInputs(items: AcuItem[]): Promise<AcuItemInput[]> {
    const materialIds = [...new Set(items.filter((i) => i.materialId).map((i) => i.materialId))];
    const materiales = materialIds.length
      ? await this.materialsRepository.find({ where: { id: In(materialIds) } })
      : [];
    const unidades = await this.unitsRepository.find();
    const unitById = new Map(unidades.map((u) => [u.id, u]));
    const matById = new Map(materiales.map((m) => [m.id, m]));

    return items.map((item) => {
      let quantity = item.quantity;
      const material = item.materialId ? matById.get(item.materialId) : null;

      if (material && item.unitId && item.unitId !== material.unitId) {
        const desde = unitById.get(item.unitId);
        const hasta = unitById.get(material.unitId);
        const convertida =
          desde && hasta ? convertQuantity(item.quantity, desde, hasta) : null;
        if (convertida !== null) quantity = convertida;
      }

      return {
        id: item.id,
        kind: item.kind,
        description: item.description ?? material?.name ?? '',
        materialId: item.materialId,
        quantity,
        unitCost: item.unitCost,
        basis: item.basis,
        pct: item.pct,
        wastePct: item.wastePct,
      };
    });
  }

  /**
   * Coherencia de una línea. Es aquí donde se paran los datos que no significan nada.
   *
   * Devuelve `null` explícito en los campos que hay que limpiar (no `undefined`): al
   * editar, `Object.assign` con `undefined` dejaría el valor viejo puesto, y una línea
   * que pasa de porcentaje a rendimiento se quedaría con el `pct` anterior colgando.
   * El cast salva que la convención del repo tipa las columnas nullable sin `| null`.
   */
  private async validateItem(dto: AcuItemDto): Promise<Partial<AcuItem>> {
    const esPorcentaje = dto.kind !== 'material' && dto.basis === 'pct_materials';

    if (dto.kind === 'material') {
      if (!dto.materialId && dto.unitCost == null) {
        throw new BadRequestException(
          'Una línea de material necesita un material del catálogo o un costo unitario propio',
        );
      }
      if (dto.basis === 'pct_materials') {
        throw new BadRequestException(
          'Un material no puede valorarse como porcentaje de sí mismo',
        );
      }
    }

    if (esPorcentaje) {
      if (dto.pct == null) {
        throw new BadRequestException('Falta `pct`: es obligatorio con basis = pct_materials');
      }
    } else if (dto.kind !== 'material' && dto.unitCost == null) {
      throw new BadRequestException(
        `Una línea de ${dto.kind === 'labor' ? 'mano de obra' : 'equipo'} necesita una tarifa (unitCost) o basis = pct_materials`,
      );
    }

    if (dto.kind !== 'material' && !dto.description) {
      throw new BadRequestException('La descripción es obligatoria en mano de obra y equipo');
    }

    let material: Material | null = null;
    if (dto.materialId) {
      material = await this.materialsRepository.findOne({ where: { id: dto.materialId } });
      if (!material) throw new BadRequestException(`El material ${dto.materialId} no existe`);
    }

    if (dto.unitId) {
      const unidad = await this.unitsRepository.findOne({ where: { id: dto.unitId } });
      if (!unidad) throw new BadRequestException(`La unidad ${dto.unitId} no existe`);

      // Unidad de la receta distinta a la del material: solo se admite si son
      // convertibles. Si no lo son, guardar la línea produciría un unitario sin sentido
      // (725 RD$/quintal cobrados como 725 RD$/kg) y nadie lo notaría después.
      if (material && dto.unitId !== material.unitId) {
        const destino = await this.unitsRepository.findOne({ where: { id: material.unitId } });
        const ok = destino && convertQuantity(1, unidad, destino) !== null;
        if (!ok) {
          throw new BadRequestException(
            `La unidad de la línea no es convertible a la del material "${material.name}". ` +
              'Usa la misma unidad o una de la misma magnitud.',
          );
        }
      }
    }

    return {
      kind: dto.kind,
      materialId: dto.materialId ?? null,
      description: dto.description ?? null,
      unitId: dto.unitId ?? material?.unitId ?? null,
      quantity: esPorcentaje ? 0 : (dto.quantity ?? 0),
      unitCost: dto.unitCost ?? null,
      basis: dto.kind === 'material' ? null : (dto.basis ?? 'yield'),
      pct: esPorcentaje ? dto.pct : null,
      wastePct: dto.wastePct ?? 0,
      notes: dto.notes ?? null,
    } as unknown as Partial<AcuItem>;
  }

  private async assertUnitExists(unitId: string): Promise<void> {
    if (!(await this.unitsRepository.existsBy({ id: unitId }))) {
      throw new BadRequestException(`La unidad ${unitId} no existe`);
    }
  }

  /** `ACU-00001`. Mismo esquema que `materials`. */
  private async generateCode(): Promise<string> {
    const ultimo = await this.acusRepository
      .createQueryBuilder('a')
      .orderBy('a.code', 'DESC')
      .getOne();
    const n = ultimo ? parseInt(ultimo.code.replace('ACU-', ''), 10) + 1 : 1;
    return `ACU-${String(n).padStart(5, '0')}`;
  }
}
