import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from './entities/task.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { Collaborator } from '../collaborators/entities/collaborator.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { AccessControlService } from '../common/access/access-control.service';
import type { AccessSubject } from '../common/access/access-policy';
import { taskResourceScope } from './task-access';
import { loadForUpdate } from '../common/load-for-update';
import { WhatsappService } from '../notifications/whatsapp.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Collaborator)
    private readonly collaboratorsRepository: Repository<Collaborator>,
    private readonly access: AccessControlService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async create(dto: CreateTaskDto, createdById: string): Promise<Task> {
    // La pertenencia al proyecto la exige ResourceAccessGuard vía
    // @ScopedResource({ kind: 'project', param: 'projectId', in: 'body' }).
    await this.assertProjectExists(dto.projectId);
    if (dto.assignedToId) await this.assertUserExists(dto.assignedToId);
    if (dto.collaboratorId)
      await this.assertCollaboratorExists(dto.collaboratorId);

    const task = this.tasksRepository.create({ ...dto, createdById });
    const saved = await this.tasksRepository.save(task);
    void this.notifyAssignment(saved);
    return saved;
  }

  async findAll(query: QueryTasksDto, user?: AccessSubject) {
    const {
      search,
      status,
      priority,
      projectId,
      assignedToId,
      collaboratorId,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignedTo', 'assignedTo')
      .leftJoinAndSelect('task.collaborator', 'collaborator')
      .orderBy('task.priority', 'DESC')
      .addOrderBy('task.dueDate', 'ASC', 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('task.title ILIKE :q', { q: `%${search}%` });
    }
    if (status) qb.andWhere('task.status = :status', { status });
    if (priority) qb.andWhere('task.priority = :priority', { priority });
    if (projectId) qb.andWhere('task.projectId = :projectId', { projectId });
    if (assignedToId)
      qb.andWhere('task.assignedToId = :assignedToId', { assignedToId });
    if (collaboratorId)
      qb.andWhere('task.collaboratorId = :collaboratorId', { collaboratorId });

    await this.applyTaskScope(qb, user);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, user?: AccessSubject): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: {
        project: true,
        assignedTo: true,
        collaborator: true,
        createdBy: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertTaskAccess(task, user);
    return task;
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    user?: AccessSubject,
  ): Promise<Task> {
    const task = await this.findOne(id, user);

    if (dto.projectId && dto.projectId !== task.projectId) {
      await this.assertProjectExists(dto.projectId);
      // Mover la tarea a un proyecto ajeno sería una fuga: se exige pertenencia
      // también al proyecto de destino.
      await this.access.assertProjectAccess(user, dto.projectId);
    }
    const previousAssignedToId = task.assignedToId;
    const previousCollaboratorId = task.collaboratorId;
    if (dto.assignedToId && dto.assignedToId !== task.assignedToId) {
      await this.assertUserExists(dto.assignedToId);
    }
    if (dto.collaboratorId && dto.collaboratorId !== task.collaboratorId) {
      await this.assertCollaboratorExists(dto.collaboratorId);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(
        ([, v]) => v !== undefined,
      ),
    );

    // Sobre entidad sin relaciones: si no, el objeto `assignedTo`/`collaborator`
    // cargado pisa la columna FK y la reasignación se pierde (ver loadForUpdate).
    const target = await loadForUpdate(this.tasksRepository, id, 'Task not found');
    Object.assign(target, defined);

    if (dto.status === TaskStatus.DONE && !target.completedAt) {
      target.completedAt = new Date().toISOString().split('T')[0];
    } else if (dto.status !== undefined && dto.status !== TaskStatus.DONE) {
      target.completedAt = null as unknown as string;
    }

    await this.tasksRepository.save(target);
    const updated = await this.findOne(id, user);

    // Reasignación (incluye pasar de "sin asignar" a alguien): mismo aviso
    // que al crear la tarea. Un cambio de dueDate/status/etc. sin tocar la
    // asignación NO reenvía el mensaje.
    const reassignedToNewUser =
      dto.assignedToId !== undefined && dto.assignedToId !== previousAssignedToId && dto.assignedToId;
    const reassignedToNewCollaborator =
      dto.collaboratorId !== undefined && dto.collaboratorId !== previousCollaboratorId && dto.collaboratorId;
    if (reassignedToNewUser || reassignedToNewCollaborator) {
      void this.notifyAssignment(updated);
    }

    return updated;
  }

  async remove(id: string, user?: AccessSubject): Promise<void> {
    const task = await this.findOne(id, user);
    await this.tasksRepository.remove(task);
  }

  /**
   * Avisa por WhatsApp a quien quedó asignado (usuario con cuenta y/o
   * colaborador de campo — pueden convivir en la misma tarea). Nunca lanza:
   * un fallo de WhatsApp no debe tumbar la creación/actualización de la tarea
   * (ver WhatsappService, que ya loguea y traga sus propios errores).
   */
  private async notifyAssignment(task: Task): Promise<void> {
    if (!task.assignedToId && !task.collaboratorId) return;

    const project = await this.projectsRepository.findOne({ where: { id: task.projectId } });
    if (!project) return;

    if (task.assignedToId) {
      const assignee = await this.usersRepository.findOne({ where: { id: task.assignedToId } });
      if (assignee) {
        this.whatsapp.sendTaskAssigned({
          phone: assignee.phone,
          recipientName: assignee.firstName,
          projectName: project.name,
          taskTitle: task.title,
          dueDate: task.dueDate,
        });
      }
    }

    if (task.collaboratorId) {
      const collaborator = await this.collaboratorsRepository.findOne({ where: { id: task.collaboratorId } });
      if (collaborator) {
        this.whatsapp.sendTaskAssigned({
          phone: collaborator.phone,
          recipientName: collaborator.firstName,
          projectName: project.name,
          taskTitle: task.title,
          dueDate: task.dueDate,
        });
      }
    }
  }

  // ── Acceso ────────────────────────────────────────────────────────────────

  /**
   * Comprueba pertenencia sobre una tarea ya cargada. Delega la decisión en
   * `decideAccess` a través de `AccessControlService.assertAccess` → 404.
   */
  private async assertTaskAccess(
    task: Task,
    user?: AccessSubject,
  ): Promise<void> {
    await this.access.assertAccess(
      user,
      taskResourceScope(
        {
          projectId: task.projectId,
          clientId: task.project?.clientId ?? null,
          assignedToId: task.assignedToId,
          createdById: task.createdById,
        },
        user,
      ),
    );
  }

  /**
   * Acota un listado de tareas. No se usa `applyScope()` genérico porque una
   * tarea es visible además por asignación o autoría, aunque el usuario no sea
   * miembro del proyecto; `applyScope` solo sabe de proyecto/cliente.
   * La pertenencia sale de `getListScope()`, que sigue siendo la única fuente.
   */
  private async applyTaskScope(
    qb: ReturnType<Repository<Task>['createQueryBuilder']>,
    user?: AccessSubject,
  ): Promise<void> {
    const scope = await this.access.getListScope(user);
    if (!scope) return; // ADMIN / MANAGER: sin restricción.

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (user?.id) {
      conditions.push('task.assignedToId = :acUserId');
      conditions.push('task.createdById = :acUserId');
      params.acUserId = user.id;
    }
    if (scope.projectIds.length > 0) {
      conditions.push('task.projectId IN (:...acProjectIds)');
      params.acProjectIds = scope.projectIds;
    }
    if (scope.clientIds.length > 0) {
      conditions.push('project.clientId IN (:...acClientIds)');
      params.acClientIds = scope.clientIds;
    }

    if (conditions.length === 0) {
      qb.andWhere('1 = 0'); // fail-closed
      return;
    }
    qb.andWhere(`(${conditions.join(' OR ')})`, params);
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id: projectId });
    if (!exists) throw new BadRequestException(`Project ${projectId} not found`);
  }

  private async assertUserExists(userId: string): Promise<void> {
    const exists = await this.usersRepository.existsBy({ id: userId });
    if (!exists) throw new BadRequestException(`User ${userId} not found`);
  }

  private async assertCollaboratorExists(id: string): Promise<void> {
    const exists = await this.collaboratorsRepository.existsBy({ id });
    if (!exists) throw new BadRequestException(`Collaborator ${id} not found`);
  }
}
