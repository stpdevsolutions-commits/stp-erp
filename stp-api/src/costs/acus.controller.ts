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
import { AcusService } from './acus.service';
import { CreateAcuDto, AcuItemDto } from './dto/create-acu.dto';
import { UpdateAcuDto } from './dto/update-acu.dto';
import { QueryAcusDto } from './dto/query-acus.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Partidas de obra (ACU). Modulo 'costos' (ERP-83/ERP-85): admin/manager =
 * manage, finanza = view, user = ninguno; borrado ADMIN (extra, por encima
 * de la matriz).
 */
@Controller('costs/acus')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('costos', 'view')
export class AcusController {
  constructor(private readonly acusService: AcusService) {}

  @Post()
  @RequireModule('costos', 'manage')
  create(@Body() dto: CreateAcuDto) {
    return this.acusService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryAcusDto) {
    return this.acusService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.acusService.findOne(id);
  }

  /** Valoración con los precios vigentes de hoy, con desglose línea a línea. */
  @Get(':id/cost')
  cost(@Param('id', ParseUUIDPipe) id: string) {
    return this.acusService.cost(id);
  }

  @Patch(':id')
  @RequireModule('costos', 'manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAcuDto) {
    return this.acusService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.acusService.remove(id);
  }

  // ---------------------------------------------------------------- receta

  @Post(':id/items')
  @RequireModule('costos', 'manage')
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AcuItemDto) {
    return this.acusService.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @RequireModule('costos', 'manage')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: AcuItemDto,
  ) {
    return this.acusService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @RequireModule('costos', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.acusService.removeItem(id, itemId);
  }
}
