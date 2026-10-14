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
import { loadForUpdate } from '../common/load-for-update';
import { auditLog } from '../common/audit-log';
import { saveWithUniqueCode } from '../common/save-with-unique-code';

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

    // `generateCode` es MAX+1 sin bloqueo: dos técnicos enviando una ficha casi al mismo
    // tiempo pueden calcular el mismo código; se recalcula y reintenta ante el UNIQUE.
    return saveWithUniqueCode(
      () => this.generateCode(),
      (code) =>
        this.fichasRepo.save(
          this.fichasRepo.create({
            ...dto,
            code,
            technicianId: currentUser.id,
            data: dto.data ?? {},
            photos: dto.photos ?? [],
          }),
        ),
      { label: 'la ficha' },
    );
  }

  async findAll(query: QueryFichasDto, currentUser: User): Promise<Ficha[]> {
    return (await this.findAllPaged(query, currentUser)).items;
  }

  /**
   * Lista de fichas. Sin `page`/`limit` devuelve todas (formato histórico); con alguno,
   * una página de `limit` (máx. 100, por defecto 20) y el total para la carga incremental.
   */
  async findAllPaged(
    query: QueryFichasDto,
    currentUser: User,
  ): Promise<{ items: Ficha[]; total: number; paged: boolean }> {
    const where: FindOptionsWhere<Ficha> = {};

    if (query.clientId) where.project = { clientId: query.clientId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    // Users only see their own fichas; managers and admins see all
    if (currentUser.role === UserRole.USER) {
      where.technicianId = currentUser.id;
    } else if (query.technicianId) {
      where.technicianId = query.technicianId;
    }

    const paged = query.page !== undefined || query.limit !== undefined;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);

    const [items, total] = await this.fichasRepo.findAndCount({
      where,
      relations: { project: true, technician: true },
      // createdAt puede repetirse: el id desempata para que las páginas no se solapen.
      order: { createdAt: 'DESC', id: 'DESC' },
      ...(paged ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    return { items, total, paged };
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
    // Sin relaciones: el objeto `project`/`technician` cargado pisaría la columna
    // FK y el cambio de proyecto no se guardaría (ver loadForUpdate).
    const target = await loadForUpdate(this.fichasRepo, id, 'Ficha no encontrada');
    Object.assign(target, defined);

    await this.fichasRepo.save(target);
    return this.findOne(id, currentUser);
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
    // findOne() ya deja pasar a MANAGER/ADMIN sin filtrar por técnico (ven todas las
    // fichas), pero eso es para CONSULTAR, no para borrar: un manager solo debía poder
    // eliminar las suyas, igual que un USER. Sin esto podía borrar la de cualquiera.
    if (
      currentUser.role === UserRole.MANAGER &&
      ficha.technicianId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Solo puedes eliminar tus propias fichas; un administrador puede eliminar cualquiera',
      );
    }

    auditLog(currentUser.id, 'ficha.deleted', { fichaId: id, code: ficha.code });
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
