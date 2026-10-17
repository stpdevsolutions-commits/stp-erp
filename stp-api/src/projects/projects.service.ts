import { parseSort } from '../common/sort';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { loadForUpdate } from '../common/load-for-update';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';
import { escapeLike } from '../common/like-escape';
import { saveWithUniqueCode } from '../common/save-with-unique-code';
import { buildProjectDeleteBlockMessage, ProjectDeleteBlockers } from './project-delete-guard';

const PROJECTS_SORTABLE: Record<string, string> = { code: 'project.code', name: 'project.name', status: 'project.status', budget: 'project.budget', startDate: 'project.startDate', createdAt: 'project.createdAt' };

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Collaborator)
    private readonly collaboratorsRepository: Repository<Collaborator>,
    private readonly access: AccessControlService,
  ) {}

  async create(dto: CreateProjectDto, createdById: string): Promise<Project> {
    await this.assertClientExists(dto.clientId);
    if (dto.assignedToId) await this.assertUserExists(dto.assignedToId);
    if (dto.supervisorId) await this.assertCollaboratorExists(dto.supervisorId);
    this.assertDates(dto.startDate, dto.endDate);
    this.assertCoords(dto.latitude, dto.longitude);

    return saveWithUniqueCode(
      () => this.generateCode(),
      (code) =>
        this.projectsRepository.save(
          this.projectsRepository.create({ ...dto, code, createdById }),
        ),
      { label: 'el proyecto' },
    );
  }

  async findAll(query: QueryProjectsDto, user?: AccessSubject) {
    const { search, status, type, clientId, assignedToId, supervisorId, page = 1, limit = 20 } = query;

    const sortBy = parseSort(query.sort, query.dir, PROJECTS_SORTABLE) ?? { column: 'project.createdAt', order: 'DESC' as 'ASC' | 'DESC' };
    const qb = this.projectsRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('project.assignedTo', 'assignedTo')
      .leftJoinAndSelect('project.supervisor', 'supervisor')
      .orderBy(sortBy.column, sortBy.order, 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('(project.name ILIKE :q OR project.code ILIKE :q)', { q: `%${escapeLike(search)}%` });
    }
    if (status) qb.andWhere('project.status = :status', { status });
    if (type) qb.andWhere('project.type = :type', { type });
    if (clientId) qb.andWhere('project.clientId = :clientId', { clientId });
    if (assignedToId) qb.andWhere('project.assignedToId = :assignedToId', { assignedToId });
    if (supervisorId) qb.andWhere('project.supervisorId = :supervisorId', { supervisorId });

    // Acotado por pertenencia (no-op para ADMIN/MANAGER)
    await this.access.applyScope(qb, user, {
      projectExpr: 'project.id',
      clientExpr: 'project.clientId',
    });

    const [data, total] = await qb.getManyAndCount();

    // Cifras de las tarjetas: de todo lo que cumple los filtros, no solo de la página visible.
    const filas = await qb
      .clone()
      .orderBy()
      .skip(undefined)
      .take(undefined)
      .select('project.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('project.status')
      .getRawMany<{ status: string; count: string }>();
    const byStatus = Object.fromEntries(filas.map((f) => [f.status, parseInt(f.count, 10)]));
    return { data, total, page, limit, summary: { byStatus } };
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { client: true, assignedTo: true, supervisor: true, createdBy: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);

    if (dto.clientId && dto.clientId !== project.clientId) {
      await this.assertClientExists(dto.clientId);
    }
    if (dto.assignedToId && dto.assignedToId !== project.assignedToId) {
      await this.assertUserExists(dto.assignedToId);
    }
    if (dto.supervisorId && dto.supervisorId !== project.supervisorId) {
      await this.assertCollaboratorExists(dto.supervisorId);
    }
    this.assertDates(
      dto.startDate ?? project.startDate,
      dto.endDate ?? project.endDate,
    );
    // null explícito = quitar la coordenada; undefined = no se toca (se conserva la actual).
    this.assertCoords(
      dto.latitude !== undefined ? dto.latitude : project.latitude,
      dto.longitude !== undefined ? dto.longitude : project.longitude,
    );

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    // Sin relaciones: el objeto `client`/`assignedTo` cargado pisaría la columna
    // FK y el cambio de cliente o responsable no se guardaría (ver loadForUpdate).
    const target = await loadForUpdate(
      this.projectsRepository,
      id,
      'Project not found',
    );
    Object.assign(target, defined);
    await this.projectsRepository.save(target);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const project = await this.findOne(id);
    // expenses.projectId es ON DELETE CASCADE: borrar el proyecto se llevaría los gastos
    // (incluida la mano de obra de nómina). Se bloquea si hay registros financieros.
    const blockers = await this.countDeleteBlockers(id);
    const message = buildProjectDeleteBlockMessage(project.code, blockers);
    if (message) throw new ConflictException(message);
    await this.projectsRepository.remove(project);
  }

  private async countDeleteBlockers(projectId: string): Promise<ProjectDeleteBlockers> {
    const count = async (sql: string): Promise<number> => {
      const rows: Array<{ n: string }> = await this.projectsRepository.query(sql, [projectId]);
      return parseInt(rows[0]?.n ?? '0', 10) || 0;
    };
    const [expenses, payments, payrollEntries, salesInvoices, fiscalInvoices, fichas] =
      await Promise.all([
        count('SELECT COUNT(*) AS n FROM expenses WHERE "projectId" = $1'),
        count('SELECT COUNT(*) AS n FROM payments WHERE "projectId" = $1'),
        count('SELECT COUNT(*) AS n FROM payroll_entries WHERE "projectId" = $1'),
        count('SELECT COUNT(*) AS n FROM sales_invoices WHERE "projectId" = $1'),
        count(
          'SELECT COUNT(*) AS n FROM fiscal_invoices fi JOIN expenses e ON e.id = fi."expenseId" WHERE e."projectId" = $1',
        ),
        count('SELECT COUNT(*) AS n FROM fichas WHERE "projectId" = $1'),
      ]);
    return { expenses, payments, payrollEntries, salesInvoices, fiscalInvoices, fichas };
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const row = await this.projectsRepository
      .createQueryBuilder('p')
      .select(`MAX(CAST(SPLIT_PART(p.code, '-', 3) AS INTEGER))`, 'max')
      .where('p.code LIKE :pattern', { pattern: `PRJ-${year}-%` })
      .getRawOne<{ max: string | null }>();
    const next = (parseInt(row?.max ?? '0') || 0) + 1;
    return `PRJ-${year}-${String(next).padStart(3, '0')}`;
  }

  async assertProjectBelongsToClient(projectId: string, clientId: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id: projectId, clientId });
    if (!exists) {
      throw new BadRequestException(
        `Project ${projectId} does not belong to client ${clientId}`,
      );
    }
  }

  /** ERP-80: la ubicación GPS son dos valores que van juntos: ambas o ninguna. */
  private assertCoords(latitude?: number | null, longitude?: number | null): void {
    const hasLat = latitude != null;
    const hasLon = longitude != null;
    if (hasLat !== hasLon) {
      throw new BadRequestException('La ubicación necesita latitud y longitud juntas (o ninguna)');
    }
  }

  private assertDates(startDate?: string | null, endDate?: string | null): void {
    if (!startDate || !endDate) return;
    if (endDate < startDate) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la fecha de inicio');
    }
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const exists = await this.clientsRepository.existsBy({ id: clientId });
    if (!exists) throw new BadRequestException(`Client ${clientId} not found`);
  }

  private async assertUserExists(userId: string): Promise<void> {
    const exists = await this.usersRepository.existsBy({ id: userId });
    if (!exists) throw new BadRequestException(`User ${userId} not found`);
  }

  private async assertCollaboratorExists(collaboratorId: string): Promise<void> {
    const exists = await this.collaboratorsRepository.existsBy({ id: collaboratorId });
    if (!exists) throw new BadRequestException(`Collaborator ${collaboratorId} not found`);
  }
}
