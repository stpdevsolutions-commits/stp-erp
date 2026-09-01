import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { TicketComment } from './entities/ticket-comment.entity';
import { Project } from '../projects/entities/project.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { NotifyService } from '../notify.service';

/** Orden por severidad real, no alfabético — 'urgent' quedaría antes que
 * 'medium' en ASCII pero eso no es lo que nadie quiere ver primero. */
const PRIORITY_ORDER_SQL = `CASE ticket.priority
  WHEN 'urgent' THEN 4
  WHEN 'high' THEN 3
  WHEN 'medium' THEN 2
  WHEN 'low' THEN 1
  ELSE 0
END`;

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(TicketComment)
    private readonly commentsRepository: Repository<TicketComment>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly notify: NotifyService,
  ) {}

  async create(dto: CreateTicketDto): Promise<Ticket> {
    const project = await this.projectsRepository.findOne({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // Todo en una transacción: si el INSERT del ticket falla por lo que sea,
    // el número asignado (nextTicketNumber) se revierte también — si no,
    // cada intento fallido se comería un número sin que exista el ticket.
    const saved = await this.dataSource.transaction(async (manager) => {
      // UPDATE...RETURNING es atómico: dos tickets del mismo proyecto
      // creados a la vez no pueden pisarse el número, cada UPDATE toma el
      // lock de la fila por turno. Nunca leer nextTicketNumber aparte y
      // sumarle 1 en el código — esa sí sería una condición de carrera real.
      const result = await manager.query(
        `UPDATE projects SET "nextTicketNumber" = "nextTicketNumber" + 1 WHERE id = $1 RETURNING "nextTicketNumber" - 1 AS assigned`,
        [dto.projectId],
      );
      // manager.query() en Postgres devuelve [filas, cantidadAfectada] para
      // UPDATE/DELETE con RETURNING, no las filas directo — de ahí el [0][0].
      const projectNumber: number = result[0][0].assigned;
      const ticket = manager.create(Ticket, { ...dto, projectNumber });
      return manager.save(ticket);
    });

    const full = await this.findOne(saved.id);

    this.notify.send(
      `🎫 Ticket nuevo ${project.code}-${full.projectNumber}: ${full.title}\n` +
        `${project.name} · ${full.type} · prioridad ${full.priority}`,
    );

    return full;
  }

  findAll(query: QueryTicketsDto): Promise<Ticket[]> {
    const qb = this.ticketsRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.project', 'project')
      .orderBy(PRIORITY_ORDER_SQL, 'DESC')
      .addOrderBy('ticket.createdAt', 'DESC');

    if (query.projectId)
      qb.andWhere('ticket.projectId = :projectId', { projectId: query.projectId });
    if (query.type) qb.andWhere('ticket.type = :type', { type: query.type });
    if (query.status) qb.andWhere('ticket.status = :status', { status: query.status });
    if (query.priority)
      qb.andWhere('ticket.priority = :priority', { priority: query.priority });

    return qb.getMany();
  }

  async findOne(id: string): Promise<Ticket> {
    const ticket = await this.ticketsRepository.findOne({
      where: { id },
      relations: { project: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(id);
    const wasOpen = ticket.status !== TicketStatus.DONE && ticket.status !== TicketStatus.CANCELLED;
    Object.assign(ticket, dto);
    if (dto.status === TicketStatus.DONE && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date().toISOString().split('T')[0];
    } else if (dto.status !== undefined && dto.status !== TicketStatus.DONE) {
      ticket.resolvedAt = null as unknown as string;
    }
    await this.ticketsRepository.save(ticket);
    const full = await this.findOne(id);

    if (wasOpen && dto.status === TicketStatus.DONE) {
      this.notify.send(`✅ Resuelto ${full.project.code}-${full.projectNumber}: ${full.title}`);
    }

    return full;
  }

  async remove(id: string): Promise<void> {
    const ticket = await this.findOne(id);
    await this.ticketsRepository.remove(ticket);
  }

  // ── Comentarios ──────────────────────────────────────────────────────────

  async listComments(ticketId: string): Promise<TicketComment[]> {
    await this.findOne(ticketId); // 404 si el ticket no existe
    return this.commentsRepository.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
  }

  async addComment(ticketId: string, dto: CreateCommentDto): Promise<TicketComment> {
    await this.findOne(ticketId);
    const comment = this.commentsRepository.create({ ticketId, ...dto });
    return this.commentsRepository.save(comment);
  }
}
