import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepository: Repository<InventoryItem>,
  ) {}

  async findAll(query: QueryInventoryDto) {
    const { search, category, page = 1, limit = 20 } = query;

    const baseWhere: FindOptionsWhere<InventoryItem> = {};
    if (category) baseWhere.category = category;

    let where: FindOptionsWhere<InventoryItem> | FindOptionsWhere<InventoryItem>[];

    if (search) {
      const term = `%${search}%`;
      where = [
        { ...baseWhere, name: ILike(term) },
        { ...baseWhere, sku: ILike(term) },
      ];
    } else {
      where = baseWhere;
    }

    const [data, total] = await this.inventoryRepository.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<InventoryItem> {
    const item = await this.inventoryRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async create(dto: CreateInventoryItemDto): Promise<InventoryItem> {
    const item = this.inventoryRepository.create(dto);
    return this.inventoryRepository.save(item);
  }

  async update(id: string, dto: UpdateInventoryItemDto): Promise<InventoryItem> {
    const item = await this.findOne(id);
    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(item, defined);
    return this.inventoryRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.inventoryRepository.remove(item);
  }
}
