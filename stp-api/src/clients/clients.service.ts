import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, FindOptionsWhere } from 'typeorm';
import { Client, ClientType } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';

/** UUID imposible: fuerza un resultado vacío cuando el usuario no tiene asignaciones. */
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    private readonly access: AccessControlService,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    if (dto.rnc) {
      const existing = await this.clientsRepository.findOne({ where: { rnc: dto.rnc } });
      if (existing) throw new ConflictException(`RNC/Cédula ${dto.rnc} already registered`);
    }
    const client = this.clientsRepository.create(dto);
    return this.clientsRepository.save(client);
  }

  async findAll(query: QueryClientsDto, user?: AccessSubject) {
    const { search, type, isActive, page = 1, limit = 20 } = query;

    const baseWhere: FindOptionsWhere<Client> = {};

    // Acotado por pertenencia (no-op para ADMIN/MANAGER). Un USER solo ve los
    // clientes asignados y los dueños de sus proyectos.
    const scope = await this.access.getListScope(user);
    if (scope) {
      baseWhere.id = In(
        scope.visibleClientIds.length > 0 ? scope.visibleClientIds : [NO_MATCH_ID],
      );
    }

    if (type) baseWhere.type = type;
    if (isActive !== undefined) baseWhere.isActive = isActive;

    let where: FindOptionsWhere<Client> | FindOptionsWhere<Client>[];

    if (search) {
      const term = `%${search}%`;
      where = [
        { ...baseWhere, name: ILike(term) },
        { ...baseWhere, rnc: ILike(term) },
        { ...baseWhere, email: ILike(term) },
        { ...baseWhere, contactName: ILike(term) },
      ];
    } else {
      where = baseWhere;
    }

    const [data, total] = await this.clientsRepository.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientsRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);

    if (dto.rnc && dto.rnc !== client.rnc) {
      const existing = await this.clientsRepository.findOne({ where: { rnc: dto.rnc } });
      if (existing) throw new ConflictException(`RNC/Cédula ${dto.rnc} already registered`);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(client, defined);
    return this.clientsRepository.save(client);
  }

  async remove(id: string): Promise<void> {
    const client = await this.findOne(id);
    await this.clientsRepository.remove(client);
  }
}
