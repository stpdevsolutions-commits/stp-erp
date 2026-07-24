import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join, relative } from 'path';
import { mkdirSync, statSync, existsSync, unlink } from 'fs';
import { Expense } from './entities/expense.entity';
import { Project } from '../projects/entities/project.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { FileUpload, FileContext } from '../files/entities/file-upload.entity';
import { getUploadRoot } from '../files/files.utils';
import { generateExpensePdf } from './pdf.generator';
import { SettingsService } from '../settings/settings.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    @InjectRepository(FileUpload)
    private readonly fileRepo: Repository<FileUpload>,
    private readonly settingsService: SettingsService,
    private readonly access: AccessControlService,
  ) {}

  async create(dto: CreateExpenseDto, createdById: string): Promise<Expense> {
    await this.assertProjectExists(dto.projectId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    const expense = this.expensesRepository.create({ ...dto, createdById });
    const saved = await this.expensesRepository.save(expense);
    const result = await this.findOne(saved.id);
    await this.savePdfForExpense(result).catch((err: Error) =>
      this.logger.error(`PDF generation failed for expense ${result.id}: ${err.message}`),
    );
    return result;
  }

  async findAll(query: QueryExpensesDto, user?: AccessSubject) {
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

    await this.access.applyScope(qb, user, {
      projectExpr: 'expense.projectId',
      clientExpr: 'project.clientId',
    });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({
      where: { id },
      relations: { project: { client: true }, supplier: true, createdBy: true },
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
    await this.expensesRepository.save(expense);
    const updated = await this.findOne(id);
    await this.savePdfForExpense(updated).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for expense ${id}: ${err.message}`),
    );
    return updated;
  }

  async remove(id: string): Promise<void> {
    const expense = await this.findOne(id);
    await this.expensesRepository.remove(expense);
  }

  async findPdfFile(expenseId: string): Promise<FileUpload | null> {
    return this.fileRepo.findOne({ where: { filename: `GASTO-${expenseId}.pdf` } });
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

  private async savePdfForExpense(expense: Expense): Promise<void> {
    // clientId is not a direct column on Expense — resolve it from the project
    let clientId: string | undefined = expense.project?.clientId;
    if (!clientId) {
      const project = await this.projectsRepository.findOne({
        where: { id: expense.projectId },
        select: { id: true, clientId: true },
      });
      clientId = project?.clientId;
    }
    if (!clientId) return;

    // Ensure the project relation is populated for the PDF generator
    if (!expense.project) {
      const project = await this.projectsRepository.findOne({
        where: { id: expense.projectId },
        relations: { client: true },
      });
      if (project) expense.project = project;
    }

    const destDir = join(getUploadRoot(), 'clients', clientId, 'projects', expense.projectId, 'expenses');
    mkdirSync(destDir, { recursive: true });

    const filename = `GASTO-${expense.id}.pdf`;
    const filePath = join(destDir, filename);

    const company = await this.settingsService.getCompanyData();
    await generateExpensePdf(expense, filePath, company);

    const { size } = statSync(filePath);
    const relativePath = relative(getUploadRoot(), filePath);

    // Search by filename only — it is globally unique per expense and clientId may have changed
    const existing = await this.fileRepo.findOne({ where: { filename } });
    if (existing) {
      if (existing.path !== relativePath) {
        const oldAbsPath = join(getUploadRoot(), existing.path);
        if (existsSync(oldAbsPath)) {
          unlink(oldAbsPath, (err) => {
            if (err) this.logger.error(`Failed to delete old expense PDF ${oldAbsPath}: ${err.message}`);
          });
        }
      }
      await this.fileRepo.remove(existing);
    }

    const record = this.fileRepo.create({
      originalName: filename,
      filename,
      path: relativePath,
      mimetype: 'application/pdf',
      size,
      context: FileContext.PROJECT_EXPENSES,
      clientId,
      projectId: expense.projectId,
      uploadedById: expense.createdById ?? undefined,
    });
    await this.fileRepo.save(record);
  }
}
