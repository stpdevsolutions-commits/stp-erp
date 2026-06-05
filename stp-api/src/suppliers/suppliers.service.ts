import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySuppliersDto } from './dto/query-suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    if (dto.rnc) {
      const existing = await this.suppliersRepository.findOne({ where: { rnc: dto.rnc } });
      if (existing) throw new ConflictException(`RNC ${dto.rnc} already registered`);
    }
    const supplier = this.suppliersRepository.create(dto);
    return this.suppliersRepository.save(supplier);
  }

  async findAll(query: QuerySuppliersDto) {
    const { search, category, isActive, page = 1, limit = 20 } = query;

    const baseWhere: FindOptionsWhere<Supplier> = {};
    if (category) baseWhere.category = category;
    if (isActive !== undefined) baseWhere.isActive = isActive;

    let where: FindOptionsWhere<Supplier> | FindOptionsWhere<Supplier>[];

    if (search) {
      const term = `%${search}%`;
      where = [
        { ...baseWhere, name: ILike(term) },
        { ...baseWhere, rnc: ILike(term) },
        { ...baseWhere, contactName: ILike(term) },
      ];
    } else {
      where = baseWhere;
    }

    const [data, total] = await this.suppliersRepository.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);

    if (dto.rnc && dto.rnc !== supplier.rnc) {
      const existing = await this.suppliersRepository.findOne({ where: { rnc: dto.rnc } });
      if (existing) throw new ConflictException(`RNC ${dto.rnc} already registered`);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(supplier, defined);
    return this.suppliersRepository.save(supplier);
  }

  async remove(id: string): Promise<void> {
    const supplier = await this.findOne(id);
    await this.suppliersRepository.remove(supplier);
  }
}
