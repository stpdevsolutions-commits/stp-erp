import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { loadForUpdate } from '../common/load-for-update';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly access: AccessControlService,
  ) {}

  async create(dto: CreateProjectDto, createdById: string): Promise<Project> {
    await this.assertClientExists(dto.clientId);
    if (dto.assignedToId) await this.assertUserExists(dto.assignedToId);

    const code = await this.generateCode();
    const project = this.projectsRepository.create({ ...dto, code, createdById });
    return this.projectsRepository.save(project);
  }

  async findAll(query: QueryProjectsDto, user?: AccessSubject) {
    const { search, status, type, clientId, assignedToId, page = 1, limit = 20 } = query;

    const qb = this.projectsRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('project.assignedTo', 'assignedTo')
      .orderBy('project.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('(project.name ILIKE :q OR project.code ILIKE :q)', { q: `%${search}%` });
    }
    if (status) qb.andWhere('project.status = :status', { status });
    if (type) qb.andWhere('project.type = :type', { type });
    if (clientId) qb.andWhere('project.clientId = :clientId', { clientId });
    if (assignedToId) qb.andWhere('project.assignedToId = :assignedToId', { assignedToId });

    // Acotado por pertenencia (no-op para ADMIN/MANAGER)
    await this.access.applyScope(qb, user, {
      projectExpr: 'project.id',
      clientExpr: 'project.clientId',
    });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: { client: true, assignedTo: true, createdBy: true },
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
    await this.projectsRepository.remove(project);
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

  private async assertClientExists(clientId: string): Promise<void> {
    const exists = await this.clientsRepository.existsBy({ id: clientId });
    if (!exists) throw new BadRequestException(`Client ${clientId} not found`);
  }

  private async assertUserExists(userId: string): Promise<void> {
    const exists = await this.usersRepository.existsBy({ id: userId });
    if (!exists) throw new BadRequestException(`User ${userId} not found`);
  }
}
