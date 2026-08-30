import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AgentKeyGuard } from '../common/agent-key.guard';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @UseGuards(AgentKeyGuard)
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }
}
