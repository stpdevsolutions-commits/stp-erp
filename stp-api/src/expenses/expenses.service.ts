import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { Project } from '../projects/entities/project.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
  ) {}

  async create(dto: CreateExpenseDto, createdById: string): Promise<Expense> {
    await this.assertProjectExists(dto.projectId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    const expense = this.expensesRepository.create({ ...dto, createdById });
    const saved = await this.expensesRepository.save(expense);
    return this.findOne(saved.id);
  }

  async findAll(query: QueryExpensesDto) {
    const { projectId, category, dateFrom, dateTo, page = 1, limit = 20 } = query;

    const qb = this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.project', 'project')
      .leftJoinAndSelect('expense.supplier', 'supplier')
      .leftJoinAndSelect('expense.createdBy', 'createdBy')
      .orderBy('expense.date', 'DESC')
      .addOrderBy('expense.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (projectId) qb.andWhere('expense.projectId = :projectId', { projectId });
    if (category) qb.andWhere('expense.category = :category', { category });
    if (dateFrom) qb.andWhere('expense.date >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('expense.date <= :dateTo', { dateTo });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({
      where: { id },
      relations: { project: true, supplier: true, createdBy: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const expense = await this.findOne(id);

    if (dto.projectId && dto.projectId !== expense.projectId) {
      await this.assertProjectExists(dto.projectId);
    }
    if (dto.supplierId && dto.supplierId !== expense.supplierId) {
      await this.assertSupplierExists(dto.supplierId);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(expense, defined);
    return this.expensesRepository.save(expense);
  }

  async remove(id: string): Promise<void> {
    const expense = await this.findOne(id);
    await this.expensesRepository.remove(expense);
  }

  async sumByProject(projectId: string): Promise<number> {
    const { sum } = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('SUM(expense.amount)', 'sum')
      .where('expense.projectId = :projectId', { projectId })
      .getRawOne();
    return parseFloat(sum ?? '0');
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id: projectId });
    if (!exists) throw new BadRequestException(`Project ${projectId} not found`);
  }

  private async assertSupplierExists(supplierId: string): Promise<void> {
    const exists = await this.suppliersRepository.existsBy({ id: supplierId });
    if (!exists) throw new BadRequestException(`Supplier ${supplierId} not found`);
  }
}
