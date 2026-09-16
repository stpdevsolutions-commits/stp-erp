import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint, SprintStatus } from './entities/sprint.entity';
import { Ticket, TicketStatus } from '../tickets/entities/ticket.entity';
import { Project } from '../projects/entities/project.entity';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { NotifyService } from '../notify.service';

/** Conteo de tickets de una etapa desglosado por estado. Se calcula, no se
 * guarda — así nunca queda desincronizado con los tickets reales. */
export interface SprintStats {
  total: number;
  done: number;
  inProgress: number;
  review: number;
  pending: number;
  cancelled: number;
}

export type SprintWithStats = Sprint & { stats: SprintStats };

function emptyStats(): SprintStats {
  return { total: 0, done: 0, inProgress: 0, review: 0, pending: 0, cancelled: 0 };
}

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint)
    private readonly sprintsRepository: Repository<Sprint>,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly notify: NotifyService,
  ) {}

  /** Cuenta los tickets de TODAS las etapas por estado en una sola query
   * (GROUP BY sprintId, status) en vez de un findOne por etapa. Devuelve un
   * Map sprintId -> stats. */
  private async statsBySprint(): Promise<Map<string, SprintStats>> {
    const rows = await this.ticketsRepository
      .createQueryBuilder('ticket')
      .select('ticket.sprintId', 'sprintId')
      .addSelect('ticket.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('ticket.sprintId IS NOT NULL')
      .groupBy('ticket.sprintId')
      .addGroupBy('ticket.status')
      .getRawMany<{ sprintId: string; status: TicketStatus; count: string }>();

    const map = new Map<string, SprintStats>();
    for (const row of rows) {
      const s = map.get(row.sprintId) ?? emptyStats();
      const n = Number(row.count);
      s.total += n;
      if (row.status === TicketStatus.DONE) s.done += n;
      else if (row.status === TicketStatus.IN_PROGRESS) s.inProgress += n;
      else if (row.status === TicketStatus.REVIEW) s.review += n;
      else if (row.status === TicketStatus.PENDING) s.pending += n;
      else if (row.status === TicketStatus.CANCELLED) s.cancelled += n;
      map.set(row.sprintId, s);
    }
    return map;
  }

  async findAll(): Promise<SprintWithStats[]> {
    const [sprints, stats] = await Promise.all([
      this.sprintsRepository.find({
        relations: { project: true },
        // Por fecha de inicio primero; position desempata las que arrancan
        // el mismo día. El timeline se lee de arriba a abajo con este orden.
        order: { startDate: 'ASC', position: 'ASC', createdAt: 'ASC' },
      }),
      this.statsBySprint(),
    ]);
    return sprints.map((s) => ({ ...s, stats: stats.get(s.id) ?? emptyStats() }));
  }

  async findOne(id: string): Promise<SprintWithStats> {
    const sprint = await this.sprintsRepository.findOne({
      where: { id },
      relations: { project: true },
    });
    if (!sprint) throw new NotFoundException('Sprint not found');
    const stats = (await this.statsBySprint()).get(id) ?? emptyStats();
    return { ...sprint, stats };
  }

  async create(dto: CreateSprintDto): Promise<SprintWithStats> {
    if (dto.projectId) {
      const project = await this.projectsRepository.findOne({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
    }
    const sprint = this.sprintsRepository.create({ ...dto, projectId: dto.projectId ?? null });
    const saved = await this.sprintsRepository.save(sprint);
    const full = await this.findOne(saved.id);

    const scope = full.project ? full.project.name : 'varios proyectos';
    this.notify.send(
      `🗺️ Etapa nueva: ${full.name}\n${scope} · ${full.startDate} → ${full.endDate}`,
    );
    return full;
  }

  async update(id: string, dto: UpdateSprintDto): Promise<SprintWithStats> {
    const sprint = await this.sprintsRepository.findOne({
      where: { id },
      relations: { project: true },
    });
    if (!sprint) throw new NotFoundException('Sprint not found');
    const wasOpen =
      sprint.status !== SprintStatus.DONE && sprint.status !== SprintStatus.CANCELLED;

    // Reasignar el proyecto: hay que cargar la relación destino y ponerla en
    // sprint.project, no solo sprint.projectId. `sprint` viene con la
    // relación `project` ya cargada (al proyecto viejo) y TypeORM usa esa al
    // guardar la FK, no el id suelto — mismo detalle que en TicketsService.
    let newProject: Project | null | undefined;
    if (dto.projectId != null && dto.projectId !== sprint.projectId) {
      const project = await this.projectsRepository.findOne({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
      newProject = project;
    } else if (dto.projectId === null) {
      newProject = null;
    }

    Object.assign(sprint, dto);
    if (newProject !== undefined) {
      sprint.project = newProject;
      sprint.projectId = newProject ? newProject.id : null;
    }
    await this.sprintsRepository.save(sprint);
    const full = await this.findOne(id);

    if (wasOpen && dto.status === SprintStatus.DONE) {
      this.notify.send(
        `🏁 Etapa cerrada: ${full.name} (${full.stats.done}/${full.stats.total} tickets)`,
      );
    }
    return full;
  }

  async remove(id: string): Promise<void> {
    const sprint = await this.sprintsRepository.findOne({ where: { id } });
    if (!sprint) throw new NotFoundException('Sprint not found');
    // Los tickets NO se borran: su sprintId pasa a null por la FK
    // (onDelete: 'SET NULL'). Borrar una etapa solo deshace la agrupación.
    await this.sprintsRepository.remove(sprint);
  }
}
