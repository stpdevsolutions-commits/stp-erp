import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Collaborator, CollaboratorType } from './entities/collaborator.entity';
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

  private static readonly CODE_SEQUENCE: Record<CollaboratorType, string> = {
    [CollaboratorType.FIXED]: 'collaborators_code_seq_fixed',
    [CollaboratorType.CONTRACTOR]: 'collaborators_code_seq_contractor',
    [CollaboratorType.TEMPORARY]: 'collaborators_code_seq_temporary',
  };

  private static readonly CODE_PREFIX: Record<CollaboratorType, string> = {
    [CollaboratorType.FIXED]: 'F',
    [CollaboratorType.CONTRACTOR]: 'C',
    [CollaboratorType.TEMPORARY]: 'T',
  };

  /** Correlativo atómico por tipo vía secuencia de Postgres (evita colisiones con creaciones concurrentes). */
  private async nextCode(type: CollaboratorType): Promise<string> {
    const seq = CollaboratorsService.CODE_SEQUENCE[type];
    const [{ nextval }] = await this.collaboratorsRepository.query(`SELECT nextval('${seq}') AS nextval`);
    return `${CollaboratorsService.CODE_PREFIX[type]}-${String(nextval).padStart(3, '0')}`;
  }

  async create(dto: CreateCollaboratorDto): Promise<Collaborator> {
    const type = dto.type ?? CollaboratorType.FIXED;
    const code = await this.nextCode(type);
    const collaborator = this.collaboratorsRepository.create({ ...dto, type, code });
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
