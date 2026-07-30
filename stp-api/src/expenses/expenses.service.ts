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
import { MaterialPricesService } from '../costs/material-prices.service';
import { Material } from '../costs/entities/material.entity';
import { Unit } from '../costs/entities/unit.entity';
import { resolveExpenseAmount } from '../costs/expense-price';

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
    @InjectRepository(Material)
    private readonly materialsRepository: Repository<Material>,
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
    private readonly settingsService: SettingsService,
    private readonly access: AccessControlService,
    private readonly materialPrices: MaterialPricesService,
  ) {}

  async create(dto: CreateExpenseDto, createdById: string): Promise<Expense> {
    await this.assertProjectExists(dto.projectId);
    if (dto.supplierId) await this.assertSupplierExists(dto.supplierId);
    const unitId = await this.resolveCostFields(dto.materialId, dto.unitId);
    const amount = this.computeAmount(dto);

    const expense = this.expensesRepository.create({ ...dto, unitId, amount, createdById });
    const saved = await this.expensesRepository.save(expense);
    await this.syncDerivedPrice(saved, createdById);
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
      .leftJoinAndSelect('expense.material', 'material')
      .leftJoinAndSelect('expense.unit', 'unit')
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
      relations: {
        project: { client: true },
        supplier: true,
        createdBy: true,
        material: true,
        unit: true,
      },
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

    // Se valida y recalcula sobre el estado YA fusionado: un PATCH que solo cambia
    // unitPrice tiene que recalcular el importe con la cantidad que ya estaba guardada.
    expense.unitId = await this.resolveCostFields(expense.materialId, expense.unitId);
    expense.amount = this.computeAmount(expense);

    await this.expensesRepository.save(expense);
    await this.syncDerivedPrice(expense, expense.createdById);
    const updated = await this.findOne(id);
    await this.savePdfForExpense(updated).catch((err: Error) =>
      this.logger.error(`PDF regeneration failed for expense ${id}: ${err.message}`),
    );
    return updated;
  }

  async remove(id: string): Promise<void> {
    const expense = await this.findOne(id);
    // Antes de borrar: el precio derivado se ANULA (queda en el historial con motivo),
    // no se borra. La FK es SET NULL, así que sin esto quedaría un precio huérfano
    // indistinguible de uno bueno.
    await this.materialPrices.voidByExpense(expense.id, expense.createdById);
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

  /** Importe autoritativo: si hay desglose manda cantidad × unitario. */
  private computeAmount(input: {
    amount?: number;
    quantity?: number;
    unitPrice?: number;
  }): number {
    try {
      return resolveExpenseAmount(input).amount;
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /**
   * Valida material y unidad, y devuelve la unidad efectiva. Si hay material y no se
   * indicó unidad, hereda la del material. Si se indicó una distinta se rechaza: un
   * precio de RD$725/quintal guardado como RD$725/kg corrompe el historial en silencio.
   */
  private async resolveCostFields(materialId?: string, unitId?: string): Promise<string> {
    if (unitId) {
      const unitExists = await this.unitsRepository.existsBy({ id: unitId });
      if (!unitExists) throw new BadRequestException(`La unidad ${unitId} no existe`);
    }
    if (!materialId) return unitId as string;

    const material = await this.materialsRepository.findOne({
      where: { id: materialId },
      select: { id: true, code: true, unitId: true },
    });
    if (!material) throw new BadRequestException(`El material ${materialId} no existe`);

    if (!unitId) return material.unitId;
    if (unitId !== material.unitId) {
      throw new BadRequestException(
        `La unidad del gasto no coincide con la del material ${material.code}. ` +
          `Usa la unidad del material o quita el material del gasto.`,
      );
    }
    return unitId;
  }

  /**
   * Alimenta la base de precios desde el gasto. Fire-and-forget con try/catch como el
   * resto de efectos secundarios del módulo (ver notificaciones): que falle la derivación
   * de un precio no puede tumbar el registro del gasto, que es el dato contable.
   */
  private async syncDerivedPrice(expense: Expense, registeredById?: string): Promise<void> {
    try {
      await this.materialPrices.syncFromExpense({
        expenseId: expense.id,
        materialId: expense.materialId,
        quantity: expense.quantity,
        unitPrice: expense.unitPrice,
        itbisIncluded: expense.itbisIncluded,
        supplierId: expense.supplierId,
        date: expense.date,
        registeredById,
        reference: expense.description,
      });
    } catch (err) {
      this.logger.error(
        `No se pudo derivar el precio del gasto ${expense.id}: ${(err as Error).message}`,
      );
    }
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
