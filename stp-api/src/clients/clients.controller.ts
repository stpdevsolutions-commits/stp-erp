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
  BadRequestException,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScopedResource } from '../common/decorators/scoped-resource.decorator';
import { MembershipsService } from '../common/access/memberships.service';
import { AddMemberDto } from '../common/access/dto/add-member.dto';
import { ResourceAccessGuard } from '../common/guards/resource-access.guard';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DgiiService } from '../dgii/dgii.service';
import { normalizeRnc } from '../fiscal-invoices/fiscal-invoice-rules';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Modulo 'clientes' en la matriz de permisos (ERP-83/ERP-85): admin/manager
 * = manage, finanza = view, user = view (acotado por ResourceAccessGuard,
 * que sigue intacto -- este guard solo decide el modulo, no el registro).
 *
 * Los endpoints /:id/members (dar acceso a un usuario puntual) siguen
 * ADMIN-only sin tocar: es la UI de "accesos" que ERP-86 va a eliminar,
 * no forma parte de esta migracion.
 */
@Controller('clients')
@UseGuards(JwtAuthGuard, ResourceAccessGuard, ModulePermissionGuard)
@RequireModule('clientes', 'view')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly memberships: MembershipsService,
    private readonly dgii: DgiiService,
  ) {}

  // ── Asignación de usuarios al cliente (solo ADMIN) ───────────────────────

  @Get(':id/members')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberships.listClientMembers(id);
  }

  @Post(':id/members')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.memberships.addClientMember(id, dto.userId, user.id);
  }

  @Delete(':id/members/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.memberships.removeClientMember(id, userId);
  }

  /** Datos públicos del contribuyente en la DGII para rellenar el alta de un cliente. */
  @Get('rnc-lookup/:rnc')
  @RequireModule('clientes', 'manage')
  async lookupRnc(@Param('rnc') raw: string) {
    const rnc = normalizeRnc(raw);
    if (!/^(\d{9}|\d{11})$/.test(rnc)) throw new BadRequestException('RNC inválido: 9 dígitos (11 si es cédula)');
    return this.dgii.lookupRnc(rnc);
  }

  @Post()
  @RequireModule('clientes', 'manage')
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryClientsDto, @CurrentUser() user: AuthUser) {
    return this.clientsService.findAll(query, user);
  }

  @Get(':id')
  @ScopedResource('client')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @ScopedResource('client')
  @RequireModule('clientes', 'manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @ScopedResource('client')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.clientsService.remove(id, user.id);
  }
}
