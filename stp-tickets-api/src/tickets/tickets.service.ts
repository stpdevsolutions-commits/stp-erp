import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketStatus } from './entities/ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
  ) {}

  async create(dto: CreateTicketDto): Promise<Ticket> {
    const ticket = this.ticketsRepository.create(dto);
    const saved = await this.ticketsRepository.save(ticket);
    return this.findOne(saved.id);
  }

  findAll(query: QueryTicketsDto): Promise<Ticket[]> {
    const qb = this.ticketsRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.project', 'project')
      .orderBy('ticket.priority', 'DESC')
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
    Object.assign(ticket, dto);
    if (dto.status === TicketStatus.DONE && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date().toISOString().split('T')[0];
    } else if (dto.status !== undefined && dto.status !== TicketStatus.DONE) {
      ticket.resolvedAt = null as unknown as string;
    }
    await this.ticketsRepository.save(ticket);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const ticket = await this.findOne(id);
    await this.ticketsRepository.remove(ticket);
  }
}
