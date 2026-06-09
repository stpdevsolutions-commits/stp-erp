import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Collaborator } from './entities/collaborator.entity';
import { CreateCollaboratorDto } from './dto/create-collaborator.dto';
import { UpdateCollaboratorDto } from './dto/update-collaborator.dto';
import { QueryCollaboratorsDto } from './dto/query-collaborators.dto';

@Injectable()
export class CollaboratorsService {
  constructor(
    @InjectRepository(Collaborator)
    private readonly collaboratorsRepository: Repository<Collaborator>,
  ) {}

  async findAll(query: QueryCollaboratorsDto) {
    const { search, status, page = 1, limit = 20 } = query;

    const baseWhere: FindOptionsWhere<Collaborator> = {};
    if (status) baseWhere.status = status;

    let where: FindOptionsWhere<Collaborator> | FindOptionsWhere<Collaborator>[];

    if (search) {
      const term = `%${search}%`;
      where = [
        { ...baseWhere, firstName: ILike(term) },
        { ...baseWhere, lastName: ILike(term) },
        { ...baseWhere, email: ILike(term) },
        { ...baseWhere, cedula: ILike(term) },
      ];
    } else {
      where = baseWhere;
    }

    const [data, total] = await this.collaboratorsRepository.findAndCount({
      where,
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Collaborator> {
    const collaborator = await this.collaboratorsRepository.findOne({ where: { id } });
    if (!collaborator) throw new NotFoundException('Collaborator not found');
    return collaborator;
  }

  async create(dto: CreateCollaboratorDto): Promise<Collaborator> {
    const collaborator = this.collaboratorsRepository.create(dto);
    return this.collaboratorsRepository.save(collaborator);
  }

  async update(id: string, dto: UpdateCollaboratorDto): Promise<Collaborator> {
    const collaborator = await this.findOne(id);
    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(collaborator, defined);
    return this.collaboratorsRepository.save(collaborator);
  }

  async remove(id: string): Promise<void> {
    const collaborator = await this.findOne(id);
    await this.collaboratorsRepository.remove(collaborator);
  }
}
