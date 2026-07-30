import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialCategory } from './entities/material-category.entity';
import { Material } from './entities/material.entity';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';
import { UpdateMaterialCategoryDto } from './dto/update-material-category.dto';

@Injectable()
export class MaterialCategoriesService {
  constructor(
    @InjectRepository(MaterialCategory)
    private readonly categoriesRepository: Repository<MaterialCategory>,
    @InjectRepository(Material) private readonly materialsRepository: Repository<Material>,
  ) {}

  async create(dto: CreateMaterialCategoryDto): Promise<MaterialCategory> {
    await this.assertCodeFree(dto.code);
    if (dto.parentId) await this.assertExists(dto.parentId);
    return this.categoriesRepository.save(this.categoriesRepository.create(dto));
  }

  findAll(): Promise<MaterialCategory[]> {
    return this.categoriesRepository.find({ order: { code: 'ASC' } });
  }

  async findOne(id: string): Promise<MaterialCategory> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  async update(id: string, dto: UpdateMaterialCategoryDto): Promise<MaterialCategory> {
    const category = await this.findOne(id);
    if (dto.code && dto.code !== category.code) await this.assertCodeFree(dto.code);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertExists(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(category, defined);
    return this.categoriesRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);

    const children = await this.categoriesRepository.countBy({ parentId: id });
    if (children > 0) {
      throw new ConflictException(`La categoría ${category.code} tiene ${children} subcategoría(s).`);
    }

    const materials = await this.materialsRepository.countBy({ categoryId: id });
    if (materials > 0) {
      throw new ConflictException(
        `La categoría ${category.code} tiene ${materials} material(es). Reasígnalos o desactívala.`,
      );
    }

    await this.categoriesRepository.remove(category);
  }

  private async assertCodeFree(code: string): Promise<void> {
    const existing = await this.categoriesRepository.findOne({ where: { code } });
    if (existing) throw new ConflictException(`Ya existe una categoría con código ${code}`);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.categoriesRepository.existsBy({ id });
    if (!exists) throw new BadRequestException(`La categoría ${id} no existe`);
  }

  /** Sin esto, A→B y B→A dejan el árbol con un ciclo y cualquier recorrido cuelga. */
  private async assertNoCycle(id: string, parentId: string): Promise<void> {
    let cursor: string | null = parentId;
    const seen = new Set<string>([id]);

    while (cursor) {
      if (seen.has(cursor)) {
        throw new BadRequestException('El padre indicado crearía un ciclo en el árbol de categorías');
      }
      seen.add(cursor);
      const parent: MaterialCategory | null = await this.categoriesRepository.findOne({
        where: { id: cursor },
        select: { id: true, parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }
}
