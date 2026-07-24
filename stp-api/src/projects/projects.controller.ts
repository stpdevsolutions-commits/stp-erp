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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { MembershipsService } from '../common/access/memberships.service';
import { AddMemberDto } from '../common/access/dto/add-member.dto';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

@Controller('projects')
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly memberships: MembershipsService,
  ) {}

  // ── Asignación de usuarios al proyecto (solo ADMIN) ──────────────────────

  @Get(':id/members')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberships.listProjectMembers(id);
  }

  @Post(':id/members')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.memberships.addProjectMember(id, dto.userId, user.id);
  }

  @Delete(':id/members/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.memberships.removeProjectMember(id, userId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projectsService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryProjectsDto, @CurrentUser() user: AuthUser) {
    return this.projectsService.findAll(query, user);
  }

  @Get(':id')
  @ScopedResource('project')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @ScopedResource('project')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @ScopedResource('project')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.remove(id);
  }
}
