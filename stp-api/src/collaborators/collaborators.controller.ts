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
import { CollaboratorsService } from './collaborators.service';
import { CreateCollaboratorDto } from './dto/create-collaborator.dto';
import { UpdateCollaboratorDto } from './dto/update-collaborator.dto';
import { QueryCollaboratorsDto } from './dto/query-collaborators.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Modulo 'colaboradores' (ERP-83/ERP-85): admin = manage, manager/finanza =
 * view, user = ninguno. CAMBIO real: antes manager podia crear/editar
 * colaboradores; la matriz lo baja a solo lectura.
 */
@Controller('collaborators')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('colaboradores', 'view')
export class CollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  @Post()
  @RequireModule('colaboradores', 'manage')
  create(@Body() dto: CreateCollaboratorDto) {
    return this.collaboratorsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryCollaboratorsDto) {
    return this.collaboratorsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.collaboratorsService.findOne(id);
  }

  @Patch(':id')
  @RequireModule('colaboradores', 'manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollaboratorDto) {
    return this.collaboratorsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.collaboratorsService.remove(id);
  }
}
