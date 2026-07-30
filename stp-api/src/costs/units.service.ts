import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unit } from './entities/unit.entity';
import { Material } from './entities/material.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit) private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(Material) private readonly materialsRepository: Repository<Material>,
  ) {}

  async create(dto: CreateUnitDto): Promise<Unit> {
    await this.assertCodeFree(dto.code);
    await this.assertConversionCoherent(dto.baseUnitId, dto.factor);
    return this.unitsRepository.save(this.unitsRepository.create(dto));
  }

  findAll(): Promise<Unit[]> {
    return this.unitsRepository.find({ order: { kind: 'ASC', code: 'ASC' } });
  }

  async findOne(id: string): Promise<Unit> {
    const unit = await this.unitsRepository.findOne({ where: { id } });
    if (!unit) throw new NotFoundException('Unidad no encontrada');
    return unit;
  }

  async update(id: string, dto: UpdateUnitDto): Promise<Unit> {
    const unit = await this.findOne(id);
    if (dto.code && dto.code !== unit.code) await this.assertCodeFree(dto.code);

    const baseUnitId = dto.baseUnitId ?? unit.baseUnitId;
    const factor = dto.factor ?? unit.factor;
    if (baseUnitId === id) throw new BadRequestException('Una unidad no puede ser su propia base');
    await this.assertConversionCoherent(baseUnitId, factor);

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(unit, defined);
    return this.unitsRepository.save(unit);
  }

  async remove(id: string): Promise<void> {
    const unit = await this.findOne(id);

    const inUse = await this.materialsRepository.countBy({ unitId: id });
    if (inUse > 0) {
      throw new ConflictException(
        `La unidad ${unit.code} está usada por ${inUse} material(es). Desactívala en vez de borrarla.`,
      );
    }

    const isBase = await this.unitsRepository.countBy({ baseUnitId: id });
    if (isBase > 0) {
      throw new ConflictException(`La unidad ${unit.code} es base de otras ${isBase} unidad(es).`);
    }

    await this.unitsRepository.remove(unit);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const existing = await this.unitsRepository.findOne({ where: { code } });
    if (existing) throw new ConflictException(`Ya existe una unidad con código ${code}`);
  }

  /** O ambas cosas o ninguna: una base sin factor (o al revés) no permite convertir nada. */
  private async assertConversionCoherent(baseUnitId?: string, factor?: number): Promise<void> {
    const hasBase = baseUnitId != null;
    const hasFactor = factor != null;
    if (hasBase !== hasFactor) {
      throw new BadRequestException('baseUnitId y factor deben indicarse juntos');
    }
    if (hasBase) {
      const exists = await this.unitsRepository.existsBy({ id: baseUnitId });
      if (!exists) throw new BadRequestException(`La unidad base ${baseUnitId} no existe`);
    }
  }
}
