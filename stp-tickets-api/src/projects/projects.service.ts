import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
  ) {}

  findAll(): Promise<Project[]> {
    return this.projectsRepository.find({ order: { name: 'ASC' } });
  }

  create(dto: CreateProjectDto): Promise<Project> {
    const project = this.projectsRepository.create(dto);
    return this.projectsRepository.save(project);
  }

  /** Crea el catálogo inicial si la tabla está vacía — evita un paso manual
   * de seed la primera vez que arranca el servicio. */
  async seedIfEmpty(defaults: { slug: string; name: string }[]): Promise<void> {
    const count = await this.projectsRepository.count();
    if (count > 0) return;
    await this.projectsRepository.save(
      defaults.map((d) => this.projectsRepository.create(d)),
    );
  }
}
