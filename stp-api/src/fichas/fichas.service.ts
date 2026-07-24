import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Ficha, FichaStatus } from './entities/ficha.entity';
import { generateFichaPdfHtml } from './pdf.generator';
import { Project } from '../projects/entities/project.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateFichaDto } from './dto/create-ficha.dto';
import { UpdateFichaDto } from './dto/update-ficha.dto';
import { QueryFichasDto } from './dto/query-fichas.dto';

@Injectable()
export class FichasService {
  constructor(
    @InjectRepository(Ficha)
    private readonly fichasRepo: Repository<Ficha>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
  ) {}

  async create(dto: CreateFichaDto, currentUser: User): Promise<Ficha> {
    const project = await this.projectsRepo.findOne({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const code = await this.generateCode();

    const ficha = this.fichasRepo.create({
      ...dto,
      code,
      technicianId: currentUser.id,
      data: dto.data ?? {},
      photos: dto.photos ?? [],
    });

    return this.fichasRepo.save(ficha);
  }

  async findAll(query: QueryFichasDto, currentUser: User): Promise<Ficha[]> {
    const where: FindOptionsWhere<Ficha> = {};

    if (query.projectId) where.projectId = query.projectId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    // Users only see their own fichas; managers and admins see all
    if (currentUser.role === UserRole.USER) {
      where.technicianId = currentUser.id;
    } else if (query.technicianId) {
      where.technicianId = query.technicianId;
    }

    return this.fichasRepo.find({
      where,
      relations: { project: true, technician: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, currentUser: User): Promise<Ficha> {
    const ficha = await this.fichasRepo.findOne({
      where: { id },
      relations: { project: true, technician: true },
    });
    if (!ficha) throw new NotFoundException('Ficha no encontrada');

    // 404 (no 403): revelar que la ficha existe ya es una fuga de información.
    // El acceso por pertenencia al proyecto lo comprueba ResourceAccessGuard.
    if (
      currentUser.role === UserRole.USER &&
      ficha.technicianId !== currentUser.id
    ) {
      throw new NotFoundException('Ficha no encontrada');
    }

    return ficha;
  }

  async update(id: string, dto: UpdateFichaDto, currentUser: User): Promise<Ficha> {
    const ficha = await this.findOne(id, currentUser);

    if (ficha.status === FichaStatus.ENVIADA && currentUser.role === UserRole.USER) {
      throw new BadRequestException('No puedes editar una ficha ya enviada');
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(ficha, defined);

    return this.fichasRepo.save(ficha);
  }

  async submit(id: string, currentUser: User): Promise<Ficha> {
    const ficha = await this.findOne(id, currentUser);

    if (ficha.status === FichaStatus.ENVIADA) {
      throw new BadRequestException('La ficha ya fue enviada');
    }

    ficha.status = FichaStatus.ENVIADA;
    ficha.submittedAt = new Date();

    return this.fichasRepo.save(ficha);
  }

  async remove(id: string, currentUser: User): Promise<void> {
    const ficha = await this.findOne(id, currentUser);

    if (ficha.status === FichaStatus.ENVIADA && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo un administrador puede eliminar fichas enviadas');
    }

    await this.fichasRepo.remove(ficha);
  }

  async getPdfHtml(id: string, currentUser: User): Promise<string> {
    const ficha = await this.findOne(id, currentUser);
    return generateFichaPdfHtml(ficha);
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `FT-${year}-`;

    const last = await this.fichasRepo
      .createQueryBuilder('f')
      .where('f.code LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('f.code', 'DESC')
      .getOne();

    const nextNum = last
      ? parseInt(last.code.split('-')[2], 10) + 1
      : 1;

    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }
}
