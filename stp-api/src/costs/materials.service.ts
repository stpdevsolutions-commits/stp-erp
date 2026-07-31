import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Material } from './entities/material.entity';
import { MaterialPrice } from './entities/material-price.entity';
import { Unit } from './entities/unit.entity';
import { MaterialCategory } from './entities/material-category.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { loadForUpdate } from '../common/load-for-update';
import { normalizeMaterialName, summarizePrices, PriceSummary } from './price-selection';

export type MaterialWithSummary = Material & { priceSummary?: PriceSummary };

/**
 * Tope de precios que se cargan en memoria para resumir un lote de materiales.
 * Con el volumen previsto (decenas de precios por material) sobra; si algún día un
 * material acumula miles, el resumen del LISTADO debe pasar a SQL agregado
 * (el detalle de un material ya va paginado por su cuenta).
 */
const SUMMARY_PRICE_CAP = 5000;

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material) private readonly materialsRepository: Repository<Material>,
    @InjectRepository(MaterialPrice) private readonly pricesRepository: Repository<MaterialPrice>,
    @InjectRepository(Unit) private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(MaterialCategory)
    private readonly categoriesRepository: Repository<MaterialCategory>,
  ) {}

  async create(dto: CreateMaterialDto): Promise<Material> {
    await this.assertUnitExists(dto.unitId);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    const normalizedName = normalizeMaterialName(dto.name);
    await this.assertNotDuplicate(normalizedName, dto.brand);

    const material = this.materialsRepository.create({
      ...dto,
      normalizedName,
      code: await this.generateCode(),
    });
    return this.materialsRepository.save(material);
  }

  async findAll(query: QueryMaterialsDto) {
    const {
      search,
      categoryId,
      unitId,
      brand,
      isActive,
      withPrices,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.materialsRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.unit', 'unit')
      .leftJoinAndSelect('m.category', 'category');

    if (categoryId) qb.andWhere('m.categoryId = :categoryId', { categoryId });
    if (unitId) qb.andWhere('m.unitId = :unitId', { unitId });
    if (brand) qb.andWhere('m.brand ILIKE :brand', { brand: `%${brand}%` });
    if (isActive !== undefined) qb.andWhere('m.isActive = :isActive', { isActive });

    if (search) {
      // Se busca también sobre normalizedName para que "tuberia" encuentre "Tubería".
      const term = `%${search}%`;
      const normalized = `%${normalizeMaterialName(search)}%`;
      qb.andWhere(
        `(m.name ILIKE :term OR m.normalizedName ILIKE :normalized OR m.code ILIKE :term
          OR m.brand ILIKE :term OR m.model ILIKE :term OR m.barcode ILIKE :term)`,
        { term, normalized },
      );
    }

    const [data, total] = await qb
      .orderBy('m.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (!withPrices || data.length === 0) {
      return { data, total, page, limit };
    }

    return {
      data: await this.attachPriceSummaries(data),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Material> {
    const material = await this.materialsRepository.findOne({
      where: { id },
      relations: { unit: true, category: true },
    });
    if (!material) throw new NotFoundException('Material no encontrado');
    return material;
  }

  async update(id: string, dto: UpdateMaterialDto): Promise<Material> {
    const material = await this.findOne(id);
    if (dto.unitId && dto.unitId !== material.unitId) {
      await this.assertUnitExists(dto.unitId);
      await this.assertUnitChangeSafe(material);
    }
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    // Sin relaciones: el objeto `unit`/`category` cargado pisaría la columna FK
    // y el cambio de unidad o categoría no se guardaría (ver loadForUpdate).
    const target = await loadForUpdate(
      this.materialsRepository,
      id,
      'Material no encontrado',
    );
    Object.assign(target, defined);

    // El nombre canónico se deriva del nombre: nunca se acepta del cliente.
    if (dto.name !== undefined) {
      target.normalizedName = normalizeMaterialName(dto.name);
      await this.assertNotDuplicate(target.normalizedName, target.brand, id);
    }

    await this.materialsRepository.save(target);
    return this.findOne(id);
  }

  /**
   * Borrado real solo si el material NO tiene historial: la FK es CASCADE, así que
   * borrarlo se llevaría sus precios en silencio y el historial es el activo del módulo.
   */
  async remove(id: string): Promise<void> {
    const material = await this.findOne(id);

    const prices = await this.pricesRepository.countBy({ materialId: id });
    if (prices > 0) {
      throw new ConflictException(
        `${material.code} tiene ${prices} precio(s) registrados y borrarlo destruiría su historial. ` +
          `Desactívalo con isActive = false.`,
      );
    }

    await this.materialsRepository.remove(material);
  }

  /** Candidatos a duplicado de un nombre, para revisar antes de crear. */
  async findSimilar(name: string, limit = 10): Promise<Material[]> {
    const normalized = normalizeMaterialName(name);
    if (!normalized) return [];

    // Coincidencia por palabras significativas (>=3 caracteres) del nombre normalizado.
    const words = normalized.split(' ').filter((w) => w.length >= 3);
    if (words.length === 0) return [];

    const qb = this.materialsRepository.createQueryBuilder('m').leftJoinAndSelect('m.unit', 'unit');
    words.forEach((w, i) => {
      qb.andWhere(`m.normalizedName LIKE :w${i}`, { [`w${i}`]: `%${w}%` });
    });

    return qb.orderBy('m.name', 'ASC').take(limit).getMany();
  }

  private async attachPriceSummaries(materials: Material[]): Promise<MaterialWithSummary[]> {
    const ids = materials.map((m) => m.id);
    const prices = await this.pricesRepository.find({
      where: { materialId: In(ids), voidedAt: IsNull() },
      select: { id: true, materialId: true, supplierId: true, netUnitPrice: true, date: true, createdAt: true },
      take: SUMMARY_PRICE_CAP,
    });

    const byMaterial = new Map<string, MaterialPrice[]>();
    for (const price of prices) {
      const bucket = byMaterial.get(price.materialId);
      if (bucket) bucket.push(price);
      else byMaterial.set(price.materialId, [price]);
    }

    return materials.map((m) =>
      Object.assign(m, { priceSummary: summarizePrices(byMaterial.get(m.id) ?? []) }),
    );
  }

  private async assertNotDuplicate(
    normalizedName: string,
    brand?: string,
    exceptId?: string,
  ): Promise<void> {
    const qb = this.materialsRepository
      .createQueryBuilder('m')
      .where('m.normalizedName = :normalizedName', { normalizedName });

    // Misma marca (o ambos sin marca) = mismo material. Marcas distintas son materiales distintos.
    if (brand) qb.andWhere('LOWER(m.brand) = LOWER(:brand)', { brand });
    else qb.andWhere('m.brand IS NULL');

    if (exceptId) qb.andWhere('m.id != :exceptId', { exceptId });

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `${existing.code} ya registra este material ("${existing.name}"${
          existing.brand ? `, marca ${existing.brand}` : ''
        }). Si es distinto, diferéncialo por marca o modelo.`,
      );
    }
  }

  /**
   * Cambiar la unidad de un material con historial invalidaría sus precios: RD$725/unidad
   * no es RD$725/quintal. Se bloquea y se pide crear un material nuevo.
   */
  private async assertUnitChangeSafe(material: Material): Promise<void> {
    const prices = await this.pricesRepository.countBy({ materialId: material.id });
    if (prices > 0) {
      throw new ConflictException(
        `${material.code} tiene ${prices} precio(s) registrados en su unidad actual; cambiarla dejaría ` +
          `el historial sin sentido. Crea un material nuevo con la unidad correcta.`,
      );
    }
  }

  private async assertUnitExists(id: string): Promise<void> {
    const exists = await this.unitsRepository.existsBy({ id });
    if (!exists) throw new BadRequestException(`La unidad ${id} no existe`);
  }

  private async assertCategoryExists(id: string): Promise<void> {
    const exists = await this.categoriesRepository.existsBy({ id });
    if (!exists) throw new BadRequestException(`La categoría ${id} no existe`);
  }

  /** `MAT-00001`, secuencia global (no por año: un material no "pertenece" a un año). */
  private async generateCode(): Promise<string> {
    const row = await this.materialsRepository
      .createQueryBuilder('m')
      .select(`MAX(CAST(SPLIT_PART(m.code, '-', 2) AS INTEGER))`, 'max')
      .where(`m.code LIKE 'MAT-%'`)
      .getRawOne<{ max: string | null }>();
    const next = (parseInt(row?.max ?? '0') || 0) + 1;
    return `MAT-${String(next).padStart(5, '0')}`;
  }
}
