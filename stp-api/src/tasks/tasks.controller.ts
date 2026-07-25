import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

// La pertenencia de las rutas con `:id` (findOne/update/remove) la resuelve
// TasksService cargando la tarea y llamando a decideAccess, porque una tarea es
// accesible además por asignación o autoría (no solo por proyecto/cliente) y el
// tipo de recurso 'task' no existe en @ScopedResource. El único caso que sí pasa
// por el guard es POST, que valida el proyecto del cuerpo antes de crear.
@Controller('tasks')
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ScopedResource({ kind: 'project', param: 'projectId', in: 'body' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryTasksDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.tasksService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.tasksService.remove(id, user);
  }
}
