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
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateTaskDto, createdById: string): Promise<Task> {
    await this.assertProjectExists(dto.projectId);
    if (dto.assignedToId) await this.assertUserExists(dto.assignedToId);

    const task = this.tasksRepository.create({ ...dto, createdById });
    return this.tasksRepository.save(task);
  }

  async findAll(query: QueryTasksDto) {
    const { search, status, priority, projectId, assignedToId, page = 1, limit = 20 } = query;

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignedTo', 'assignedTo')
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
    if (assignedToId) qb.andWhere('task.assignedToId = :assignedToId', { assignedToId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: { project: true, assignedTo: true, createdBy: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);

    if (dto.projectId && dto.projectId !== task.projectId) {
      await this.assertProjectExists(dto.projectId);
    }
    if (dto.assignedToId && dto.assignedToId !== task.assignedToId) {
      await this.assertUserExists(dto.assignedToId);
    }

    const defined = Object.fromEntries(
      Object.entries(dto as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    Object.assign(task, defined);

    if (dto.status === TaskStatus.DONE && !task.completedAt) {
      task.completedAt = new Date().toISOString().split('T')[0];
    } else if (dto.status !== undefined && dto.status !== TaskStatus.DONE) {
      task.completedAt = null as unknown as string;
    }

    return this.tasksRepository.save(task);
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.projectsRepository.existsBy({ id: projectId });
    if (!exists) throw new BadRequestException(`Project ${projectId} not found`);
  }

  private async assertUserExists(userId: string): Promise<void> {
    const exists = await this.usersRepository.existsBy({ id: userId });
    if (!exists) throw new BadRequestException(`User ${userId} not found`);
  }
}
