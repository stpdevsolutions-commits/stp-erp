import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectMember } from '../../projects/entities/project-member.entity';
import { ClientMember } from '../../clients/entities/client-member.entity';
import { Project } from '../../projects/entities/project.entity';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { AccessControlService } from './access-control.service';

export interface MemberView {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  /** true = viene de `projects.assignedToId`, no se puede quitar desde aquí. */
  implicit: boolean;
  createdAt: Date | null;
}

/** Alta/baja de asignaciones de usuarios a proyectos y clientes (solo ADMIN). */
@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly projectMembers: Repository<ProjectMember>,
    @InjectRepository(ClientMember)
    private readonly clientMembers: Repository<ClientMember>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly access: AccessControlService,
  ) {}

  // ── Proyectos ──────────────────────────────────────────────────────────────

  async listProjectMembers(projectId: string): Promise<MemberView[]> {
    const project = await this.projects.findOne({
      where: { id: projectId },
      select: { id: true, assignedToId: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const rows = await this.projectMembers.find({ where: { projectId } });
    const userIds = new Set(rows.map((r) => r.userId));
    if (project.assignedToId) userIds.add(project.assignedToId);
    if (userIds.size === 0) return [];

    const users = await this.users.find({ where: { id: In([...userIds]) } });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      implicit: !rows.some((r) => r.userId === u.id),
      createdAt: rows.find((r) => r.userId === u.id)?.createdAt ?? null,
    }));
  }

  async addProjectMember(
    projectId: string,
    userId: string,
    createdById?: string,
  ) {
    await this.assertProjectExists(projectId);
    await this.assertUserExists(userId);

    const existing = await this.projectMembers.findOne({
      where: { projectId, userId },
    });
    if (!existing) {
      await this.projectMembers.save(
        this.projectMembers.create({
          projectId,
          userId,
          createdById: createdById ?? undefined,
        }),
      );
    }
    this.access.invalidate(userId);
    return this.listProjectMembers(projectId);
  }

  async removeProjectMember(projectId: string, userId: string) {
    const row = await this.projectMembers.findOne({
      where: { projectId, userId },
    });
    if (!row) {
      const project = await this.projects.findOne({
        where: { id: projectId },
        select: { id: true, assignedToId: true },
      });
      if (project?.assignedToId === userId) {
        throw new BadRequestException(
          'Ese usuario es el responsable del proyecto. Cambia el responsable del proyecto para quitarle el acceso.',
        );
      }
      throw new NotFoundException('Asignación no encontrada');
    }
    await this.projectMembers.remove(row);
    this.access.invalidate(userId);
  }

  // ── Clientes ───────────────────────────────────────────────────────────────

  async listClientMembers(clientId: string): Promise<MemberView[]> {
    await this.assertClientExists(clientId);
    const rows = await this.clientMembers.find({ where: { clientId } });
    if (rows.length === 0) return [];

    const users = await this.users.find({
      where: { id: In(rows.map((r) => r.userId)) },
    });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      implicit: false,
      createdAt: rows.find((r) => r.userId === u.id)?.createdAt ?? null,
    }));
  }

  async addClientMember(
    clientId: string,
    userId: string,
    createdById?: string,
  ) {
    await this.assertClientExists(clientId);
    await this.assertUserExists(userId);

    const existing = await this.clientMembers.findOne({
      where: { clientId, userId },
    });
    if (!existing) {
      await this.clientMembers.save(
        this.clientMembers.create({
          clientId,
          userId,
          createdById: createdById ?? undefined,
        }),
      );
    }
    this.access.invalidate(userId);
    return this.listClientMembers(clientId);
  }

  async removeClientMember(clientId: string, userId: string) {
    const row = await this.clientMembers.findOne({
      where: { clientId, userId },
    });
    if (!row) throw new NotFoundException('Asignación no encontrada');
    await this.clientMembers.remove(row);
    this.access.invalidate(userId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertProjectExists(projectId: string) {
    const exists = await this.projects.exists({ where: { id: projectId } });
    if (!exists) throw new NotFoundException('Proyecto no encontrado');
  }

  private async assertClientExists(clientId: string) {
    const exists = await this.clients.exists({ where: { id: clientId } });
    if (!exists) throw new NotFoundException('Cliente no encontrado');
  }

  private async assertUserExists(userId: string) {
    const exists = await this.users.exists({ where: { id: userId } });
    if (!exists) throw new NotFoundException('Usuario no encontrado');
  }
}
