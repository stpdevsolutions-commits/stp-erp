import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Project } from '../projects/entities/project.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Task } from '../tasks/entities/task.entity';
import { FileUpload } from '../files/entities/file-upload.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';
import { hasModuleAccess } from '../common/access/module-permissions';
import { escapeLike } from '../common/like-escape';

/** UUID imposible: fuerza a 0 filas cuando un USER no tiene ámbito (fail-closed). */
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

export interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export interface SearchResponse {
  clients: SearchResult[];
  projects: SearchResult[];
  quotes: SearchResult[];
  tasks: SearchResult[];
  files: SearchResult[];
  collaborators: SearchResult[];
}

const LIMIT = 6;

/**
 * Búsqueda global (ERP-106). Cada categoría se apaga por completo si el rol
 * no tiene al menos 'view' en su módulo (module-permissions.ts) — no basta
 * con acotar por pertenencia, porque un rol sin acceso al módulo (ej. `user`
 * y Cotizaciones) no debe ni enterarse de que existen resultados ahí. Dentro
 * de cada categoría habilitada, se aplica el MISMO acotado por pertenencia
 * que ya usa el listado de ese módulo (AccessControlService), para que la
 * búsqueda nunca muestre algo que el listado normal no mostraría.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Client) private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Project) private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(FileUpload) private readonly filesRepo: Repository<FileUpload>,
    @InjectRepository(Collaborator) private readonly collaboratorsRepo: Repository<Collaborator>,
    private readonly access: AccessControlService,
  ) {}

  async search(term: string, user: AccessSubject): Promise<SearchResponse> {
    const q = `%${escapeLike(term)}%`;

    const [clients, projects, quotes, tasks, files, collaborators] = await Promise.all([
      hasModuleAccess(user.role, 'clientes', 'view') ? this.searchClients(q, user) : [],
      hasModuleAccess(user.role, 'proyectos', 'view') ? this.searchProjects(q, user) : [],
      hasModuleAccess(user.role, 'cotizaciones', 'view') ? this.searchQuotes(q, user) : [],
      hasModuleAccess(user.role, 'tareas', 'view') ? this.searchTasks(q, user) : [],
      hasModuleAccess(user.role, 'archivos', 'view') ? this.searchFiles(q, user) : [],
      hasModuleAccess(user.role, 'colaboradores', 'view') ? this.searchCollaborators(q) : [],
    ]);

    return { clients, projects, quotes, tasks, files, collaborators };
  }

  private async searchClients(q: string, user: AccessSubject): Promise<SearchResult[]> {
    const scope = await this.access.getListScope(user);
    const qb = this.clientsRepo
      .createQueryBuilder('client')
      .where('client.name ILIKE :q', { q })
      .orderBy('client.name', 'ASC')
      .take(LIMIT);
    if (scope) {
      qb.andWhere('client.id IN (:...ids)', {
        ids: scope.visibleClientIds.length > 0 ? scope.visibleClientIds : [NO_MATCH_ID],
      });
    }
    const rows = await qb.getMany();
    return rows.map((c) => ({ id: c.id, label: c.name, href: `/dashboard/clientes/${c.id}` }));
  }

  private async searchProjects(q: string, user: AccessSubject): Promise<SearchResult[]> {
    const qb = this.projectsRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.client', 'client')
      .where('(project.name ILIKE :q OR project.code ILIKE :q)', { q })
      .orderBy('project.createdAt', 'DESC')
      .take(LIMIT);
    await this.access.applyScope(qb, user, { projectExpr: 'project.id', clientExpr: 'project.clientId' });
    const rows = await qb.getMany();
    return rows.map((p) => ({
      id: p.id,
      label: `${p.code} — ${p.name}`,
      sublabel: p.client?.name,
      href: `/dashboard/proyectos/${p.id}`,
    }));
  }

  private async searchQuotes(q: string, user: AccessSubject): Promise<SearchResult[]> {
    const qb = this.quotesRepo
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.client', 'client')
      .where('(quote.title ILIKE :q OR quote.number ILIKE :q)', { q })
      // Las revisiones reemplazadas son historial, no lo que se busca a diario.
      .andWhere('quote.supersededById IS NULL')
      .orderBy('quote.createdAt', 'DESC')
      .take(LIMIT);
    await this.access.applyScope(qb, user, { projectExpr: 'quote.projectId', clientExpr: 'quote.clientId' });
    const rows = await qb.getMany();
    return rows.map((qt) => ({
      id: qt.id,
      label: `${qt.baseNumber ?? qt.number} — ${qt.title}`,
      sublabel: qt.client?.name,
      href: `/dashboard/cotizaciones/${qt.id}`,
    }));
  }

  private async searchTasks(q: string, user: AccessSubject): Promise<SearchResult[]> {
    const qb = this.tasksRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .where('task.title ILIKE :q', { q })
      .orderBy('task.createdAt', 'DESC')
      .take(LIMIT);
    await this.access.applyScope(qb, user, { projectExpr: 'task.projectId', clientExpr: 'project.clientId' });
    const rows = await qb.getMany();
    return rows.map((t) => ({
      id: t.id,
      label: t.title,
      sublabel: t.project ? `${t.project.code} — ${t.project.name}` : undefined,
      href: `/dashboard/tareas/${t.id}`,
    }));
  }

  private async searchFiles(q: string, user: AccessSubject): Promise<SearchResult[]> {
    const qb = this.filesRepo
      .createQueryBuilder('file')
      .where('file.originalName ILIKE :q', { q })
      .orderBy('file.createdAt', 'DESC')
      .take(LIMIT);
    await this.access.applyScope(qb, user, { projectExpr: 'file.projectId', clientExpr: 'file.clientId' });
    const rows = await qb.getMany();
    const clientIds = [...new Set(rows.map((f) => f.clientId))];
    const clients = clientIds.length
      ? await this.clientsRepo.find({ where: { id: In(clientIds) } })
      : [];
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
    return rows.map((f) => ({
      id: f.id,
      label: f.originalName,
      sublabel: clientNameById.get(f.clientId),
      // Sin página propia de archivo: se enlaza al proyecto (o cliente, si no
      // tiene proyecto) — desde ahí se abre la pestaña Archivos a mano.
      href: f.projectId ? `/dashboard/proyectos/${f.projectId}` : `/dashboard/clientes/${f.clientId}/archivos`,
    }));
  }

  private async searchCollaborators(q: string): Promise<SearchResult[]> {
    // Sin acotado por pertenencia: Colaboradores es una lista de toda la
    // empresa, no ligada a cliente/proyecto (igual que su propio listado).
    const rows = await this.collaboratorsRepo
      .createQueryBuilder('c')
      .where('(c.firstName ILIKE :q OR c.lastName ILIKE :q OR c.code ILIKE :q)', { q })
      .orderBy('c.lastName', 'ASC')
      .take(LIMIT)
      .getMany();
    return rows.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      sublabel: c.code,
      // Sin página de detalle individual: se enlaza al listado.
      href: `/dashboard/colaboradores`,
    }));
  }
}
