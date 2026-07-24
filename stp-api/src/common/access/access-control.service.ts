import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  AccessSubject,
  EMPTY_MEMBERSHIP,
  ListScope,
  Membership,
  ResourceKind,
  ResourceScope,
  buildListScope,
  decideAccess,
  hasUnrestrictedAccess,
} from './access-policy';
import { ProjectMember } from '../../projects/entities/project-member.entity';
import { ClientMember } from '../../clients/entities/client-member.entity';
import { Project } from '../../projects/entities/project.entity';
import { FileUpload } from '../../files/entities/file-upload.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Ficha } from '../../fichas/entities/ficha.entity';

/** Milisegundos que se cachea la pertenencia de un usuario en memoria. */
const MEMBERSHIP_TTL_MS = 15_000;

interface CachedMembership {
  membership: Membership;
  expiresAt: number;
}

/** Columnas por las que se filtra un listado. Expresiones SQL del query builder. */
export interface ScopeColumns {
  /** p. ej. `payment.projectId` */
  projectExpr?: string;
  /** p. ej. `payment.clientId` o `project.clientId` */
  clientExpr?: string;
}

/**
 * Servicio de autorización por pertenencia. Resuelve el ámbito
 * (cliente/proyecto) de cualquier recurso y delega la decisión en
 * `decideAccess`. No hay comprobaciones de pertenencia fuera de aquí.
 */
@Injectable()
export class AccessControlService {
  private readonly cache = new Map<string, CachedMembership>();

  constructor(
    @InjectRepository(ProjectMember)
    private readonly projectMembers: Repository<ProjectMember>,
    @InjectRepository(ClientMember)
    private readonly clientMembers: Repository<ClientMember>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(FileUpload)
    private readonly files: Repository<FileUpload>,
    @InjectRepository(Quote)
    private readonly quotes: Repository<Quote>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Expense)
    private readonly expenses: Repository<Expense>,
    @InjectRepository(Ficha)
    private readonly fichas: Repository<Ficha>,
  ) {}

  // ── Pertenencia ────────────────────────────────────────────────────────────

  /** Invalida la caché de un usuario (al cambiar sus asignaciones). */
  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  async getMembership(userId: string): Promise<Membership> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.membership;

    const [clientRows, memberRows, assignedRows] = await Promise.all([
      this.clientMembers.find({
        where: { userId },
        select: { clientId: true },
      }),
      this.projectMembers.find({
        where: { userId },
        select: { projectId: true },
      }),
      this.projects.find({
        where: { assignedToId: userId },
        select: { id: true },
      }),
    ]);

    const clientIds = new Set(clientRows.map((r) => r.clientId));
    const projectIds = new Set([
      ...memberRows.map((r) => r.projectId),
      ...assignedRows.map((p) => p.id),
    ]);

    const projectClientIds = new Set<string>();
    if (projectIds.size > 0) {
      const owning = await this.projects
        .createQueryBuilder('project')
        .select('project.clientId', 'clientId')
        .where('project.id IN (:...ids)', { ids: [...projectIds] })
        .getRawMany<{ clientId: string }>();
      for (const row of owning) projectClientIds.add(row.clientId);
    }

    const membership: Membership = { clientIds, projectIds, projectClientIds };
    this.cache.set(userId, {
      membership,
      expiresAt: Date.now() + MEMBERSHIP_TTL_MS,
    });
    return membership;
  }

  // ── Decisión ───────────────────────────────────────────────────────────────

  async canAccess(
    user: AccessSubject | undefined,
    scope: ResourceScope | null,
  ): Promise<boolean> {
    if (!user) return false;
    if (hasUnrestrictedAccess(user.role)) return true;
    const membership = user.id
      ? await this.getMembership(user.id)
      : EMPTY_MEMBERSHIP;
    return decideAccess(user, membership, scope);
  }

  /** Lanza 404 (nunca 403: revelar la existencia del recurso ya es una fuga). */
  async assertAccess(
    user: AccessSubject | undefined,
    scope: ResourceScope | null,
  ): Promise<void> {
    if (!(await this.canAccess(user, scope))) {
      throw new NotFoundException('Recurso no encontrado');
    }
  }

  assertClientAccess(
    user: AccessSubject | undefined,
    clientId: string,
    strict = false,
  ) {
    return this.assertAccess(user, {
      kind: 'client',
      clientId,
      strictClient: strict,
    });
  }

  async assertProjectAccess(
    user: AccessSubject | undefined,
    projectId: string,
  ): Promise<void> {
    const scope = await this.resolveResource('project', projectId);
    await this.assertAccess(user, scope);
  }

  // ── Resolución del ámbito de cada tipo de recurso ──────────────────────────

  /** Devuelve el ámbito (cliente/proyecto/dueño) de un recurso, o null si no existe. */
  async resolveResource(
    kind: ResourceKind,
    id: string,
  ): Promise<ResourceScope | null> {
    switch (kind) {
      case 'client':
        return { kind, clientId: id };

      case 'project': {
        const p = await this.projects.findOne({
          where: { id },
          select: {
            id: true,
            clientId: true,
            assignedToId: true,
            createdById: true,
          },
        });
        return p ? { kind, clientId: p.clientId, projectId: p.id } : null;
      }

      case 'file': {
        const f = await this.files.findOne({
          where: { id },
          select: {
            id: true,
            clientId: true,
            projectId: true,
            uploadedById: true,
          },
        });
        return f
          ? {
              kind,
              clientId: f.clientId,
              projectId: f.projectId ?? null,
              ownerId: f.uploadedById,
            }
          : null;
      }

      case 'quote': {
        const q = await this.quotes.findOne({
          where: { id },
          select: { id: true, clientId: true, projectId: true },
        });
        return q
          ? { kind, clientId: q.clientId, projectId: q.projectId ?? null }
          : null;
      }

      case 'payment': {
        const p = await this.payments.findOne({
          where: { id },
          select: {
            id: true,
            clientId: true,
            projectId: true,
            createdById: true,
          },
        });
        return p
          ? {
              kind,
              clientId: p.clientId,
              projectId: p.projectId ?? null,
              ownerId: p.createdById,
            }
          : null;
      }

      case 'expense': {
        const e = await this.expenses
          .createQueryBuilder('expense')
          .leftJoin('expense.project', 'project')
          .select([
            'expense.id AS id',
            'expense.projectId AS "projectId"',
            'expense.createdById AS "createdById"',
            'project.clientId AS "clientId"',
          ])
          .where('expense.id = :id', { id })
          .getRawOne<{
            projectId: string;
            createdById: string;
            clientId: string;
          }>();
        return e
          ? {
              kind,
              clientId: e.clientId,
              projectId: e.projectId,
              ownerId: e.createdById,
            }
          : null;
      }

      case 'ficha': {
        const f = await this.fichas
          .createQueryBuilder('ficha')
          .leftJoin('ficha.project', 'project')
          .select([
            'ficha.projectId AS "projectId"',
            'ficha.technicianId AS "technicianId"',
            'project.clientId AS "clientId"',
          ])
          .where('ficha.id = :id', { id })
          .getRawOne<{
            projectId: string;
            technicianId: string;
            clientId: string;
          }>();
        return f
          ? {
              kind,
              clientId: f.clientId,
              projectId: f.projectId,
              ownerId: f.technicianId,
            }
          : null;
      }

      default:
        return null;
    }
  }

  /** Comprueba acceso a un recurso por id. Lanza 404 si no existe o no procede. */
  async assertResourceAccess(
    user: AccessSubject | undefined,
    kind: ResourceKind,
    id: string,
    strictClient = false,
  ): Promise<void> {
    if (user && hasUnrestrictedAccess(user.role)) return;
    const scope = await this.resolveResource(kind, id);
    await this.assertAccess(user, scope ? { ...scope, strictClient } : null);
  }

  // ── Filtrado de listados ───────────────────────────────────────────────────

  /** `null` = sin restricciones. */
  async getListScope(
    user: AccessSubject | undefined,
  ): Promise<ListScope | null> {
    if (!user) return { clientIds: [], projectIds: [], visibleClientIds: [] };
    if (hasUnrestrictedAccess(user.role)) return null;
    return buildListScope(user, await this.getMembership(user.id));
  }

  /**
   * Añade el filtro de pertenencia a un query builder. No hace nada para
   * ADMIN/MANAGER. Para USER: `projectExpr IN (...) OR clientExpr IN (...)`.
   */
  async applyScope<T extends object>(
    qb: SelectQueryBuilder<T>,
    user: AccessSubject | undefined,
    columns: ScopeColumns,
  ): Promise<SelectQueryBuilder<T>> {
    const scope = await this.getListScope(user);
    if (!scope) return qb;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (columns.projectExpr && scope.projectIds.length > 0) {
      conditions.push(`${columns.projectExpr} IN (:...acProjectIds)`);
      params.acProjectIds = scope.projectIds;
    }
    if (columns.clientExpr && scope.clientIds.length > 0) {
      conditions.push(`${columns.clientExpr} IN (:...acClientIds)`);
      params.acClientIds = scope.clientIds;
    }

    if (conditions.length === 0) return qb.andWhere('1 = 0');
    return qb.andWhere(`(${conditions.join(' OR ')})`, params);
  }
}
