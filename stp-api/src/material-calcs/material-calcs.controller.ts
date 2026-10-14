import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { MaterialCalcsService } from './material-calcs.service';
import {
  ClaveParam,
  CreateMaterialCalcDto,
  QueryMaterialCalcsDto,
  SetCalcLinkDto,
} from './dto/material-calc.dto';

/**
 * Calculadora de materiales de la app de técnicos (MOB-1). Mismo público que
 * las fichas (módulo 'fichas': admin/manager/user manage, user acotado por
 * pertenencia al proyecto; finanza nada).
 */
@ApiTags('material-calcs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ResourceAccessGuard, ModulePermissionGuard)
@RequireModule('fichas', 'manage')
@Controller('material-calcs')
export class MaterialCalcsController {
  constructor(private readonly service: MaterialCalcsService) {}

  @Get('links')
  getLinks() {
    return this.service.getLinks();
  }

  // Configuración compartida: solo admin y manager modifican vínculos (el rol user solo lee).
  @Put('links/:clave')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  setLink(@Param() p: ClaveParam, @Body() dto: SetCalcLinkDto, @CurrentUser() user: User) {
    return this.service.setLink(p.clave, dto.materialId, user);
  }

  @Delete('links/:clave')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deleteLink(@Param() p: ClaveParam) {
    return this.service.deleteLink(p.clave);
  }

  @Post()
  @ScopedResource({ kind: 'project', param: 'projectId', in: 'body' })
  create(@Body() dto: CreateMaterialCalcDto, @CurrentUser() user: User) {
    return this.service.create(dto, user);
  }

  @Get()
  @ScopedResource({ kind: 'project', param: 'projectId', in: 'query' })
  findAll(@Query() q: QueryMaterialCalcsDto) {
    return this.service.findAll(q.projectId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.findOne(id, user);
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const f = await this.service.getPdf(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.sendFile(f.path);
  }
}
