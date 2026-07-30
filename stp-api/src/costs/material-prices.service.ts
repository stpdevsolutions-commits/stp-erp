import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThanOrEqual, MoreThanOrEqual, Between } from 'typeorm';
import { MaterialPrice, PriceCurrency } from './entities/material-price.entity';
import { Material } from './entities/material.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { CreateMaterialPriceDto } from './dto/create-material-price.dto';
import { QueryMaterialPricesDto } from './dto/query-material-prices.dto';
import { VoidMaterialPriceDto } from './dto/void-material-price.dto';
import {
  computeNetUnitPrice,
  summarizePrices,
  currentPriceBySupplier,
  PriceSummary,
} from './price-selection';

export interface SupplierPriceRow {
  supplierId: string | null;
  supplierName: string | null;
  netUnitPrice: number;
  date: string;
  leadTimeDays: number | null;
}

export interface MaterialPriceReport {
  material: { id: string; code: string; name: string; unit: string | null };
  summary: PriceSummary;
  bySupplier: SupplierPriceRow[];
}

/**
 * Precios de materiales. **APPEND-ONLY**: este service no expone update ni delete a
 * propósito. Corregir = anular (`void`) e insertar de nuevo.
 */
@Injectable()
export class MaterialPricesService {
  constructor(
    @InjectRepository(MaterialPrice) private readonly pricesRepository: Repository<MaterialPrice>,
    @InjectRepository(Material) private readonly materialsRepository: Repository<Material>,
    @InjectRepository(Supplier) private readonly suppliersRepository: Repository<Supplier>,
  ) {}

  async create(
    materialId: string,
    dto: CreateMaterialPriceDto,
    registeredById?: string,
  ): Promise<MaterialPrice> {
    await this.assertMaterialExists(materialId);
    if (dto.supplierId) {
      const exists = await this.suppliersRepository.existsBy({ id: dto.supplierId });
      if (!exists) throw new BadRequestException(`El proveedor ${dto.supplierId} no existe`);
    }

    const currency = dto.currency ?? PriceCurrency.DOP;
    if (currency !== PriceCurrency.DOP && !dto.exchangeRate) {
      throw new BadRequestException(`Falta exchangeRate: es obligatorio para precios en ${currency}`);
    }

    const itbisRate = dto.itbisRate ?? 18;
    const date = dto.date ? dto.date.slice(0, 10) : new Date().toISOString().slice(0, 10);

    let netUnitPrice: number;
    try {
      netUnitPrice = computeNetUnitPrice({
        price: dto.price,
        currency,
        exchangeRate: dto.exchangeRate,
        itbisIncluded: dto.itbisIncluded ?? false,
        itbisRate,
        discountPct: dto.discountPct ?? 0,
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const price = this.pricesRepository.create({
      ...dto,
      materialId,
      currency,
      itbisRate,
      date,
      netUnitPrice,
      registeredById,
    });

    return this.pricesRepository.save(price);
  }

  async findAll(materialId: string, query: QueryMaterialPricesDto) {
    await this.assertMaterialExists(materialId);
    const { supplierId, region, source, from, to, includeVoided, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = { materialId };
    if (supplierId) where.supplierId = supplierId;
    if (region) where.region = region;
    if (source) where.source = source;
    if (!includeVoided) where.voidedAt = IsNull();

    if (from && to) where.date = Between(from.slice(0, 10), to.slice(0, 10));
    else if (from) where.date = MoreThanOrEqual(from.slice(0, 10));
    else if (to) where.date = LessThanOrEqual(to.slice(0, 10));

    const [data, total] = await this.pricesRepository.findAndCount({
      where,
      relations: { supplier: true },
      order: { date: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  /** Vigente, mínimo, máximo, promedio, variación y comparación entre proveedores. */
  async report(materialId: string): Promise<MaterialPriceReport> {
    const material = await this.materialsRepository.findOne({
      where: { id: materialId },
      relations: { unit: true },
    });
    if (!material) throw new NotFoundException('Material no encontrado');

    const prices = await this.pricesRepository.find({
      where: { materialId, voidedAt: IsNull() },
      relations: { supplier: true },
      order: { date: 'DESC', createdAt: 'DESC' },
    });

    return {
      material: {
        id: material.id,
        code: material.code,
        name: material.name,
        unit: material.unit?.code ?? null,
      },
      summary: summarizePrices(prices),
      bySupplier: currentPriceBySupplier(prices).map((p) => ({
        supplierId: p.supplierId ?? null,
        supplierName: (p as MaterialPrice).supplier?.name ?? null,
        netUnitPrice: p.netUnitPrice,
        date: p.date,
        leadTimeDays: (p as MaterialPrice).leadTimeDays ?? null,
      })),
    };
  }

  async findOne(id: string): Promise<MaterialPrice> {
    const price = await this.pricesRepository.findOne({
      where: { id },
      relations: { supplier: true, material: true },
    });
    if (!price) throw new NotFoundException('Precio no encontrado');
    return price;
  }

  /** Anula un precio sin borrarlo: queda en el historial marcado y con motivo. */
  async void(id: string, dto: VoidMaterialPriceDto, voidedById: string): Promise<MaterialPrice> {
    const price = await this.findOne(id);
    if (price.voidedAt) {
      throw new ConflictException('Este precio ya está anulado');
    }

    price.voidedAt = new Date();
    price.voidedById = voidedById;
    price.voidReason = dto.reason;
    return this.pricesRepository.save(price);
  }

  private async assertMaterialExists(id: string): Promise<void> {
    const exists = await this.materialsRepository.existsBy({ id });
    if (!exists) throw new NotFoundException('Material no encontrado');
  }
}
