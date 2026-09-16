import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SprintsService } from './sprints.service';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { AgentKeyGuard } from '../common/agent-key.guard';

@Controller('sprints')
export class SprintsController {
  constructor(private readonly sprints: SprintsService) {}

  @Get()
  findAll() {
    return this.sprints.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sprints.findOne(id);
  }

  @UseGuards(AgentKeyGuard)
  @Post()
  create(@Body() dto: CreateSprintDto) {
    return this.sprints.create(dto);
  }

  @UseGuards(AgentKeyGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSprintDto) {
    return this.sprints.update(id, dto);
  }

  @UseGuards(AgentKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sprints.remove(id);
  }
}
