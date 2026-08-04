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
import { UserRole } from '../users/entities/user.entity';

/**
 * Partidas de obra (ACU). Mismo RBAC que el resto del catálogo de costos: lectura para
 * cualquier autenticado, escritura MANAGER, borrado ADMIN.
 */
@Controller('costs/acus')
@UseGuards(JwtAuthGuard)
export class AcusController {
  constructor(private readonly acusService: AcusService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AcuItemDto) {
    return this.acusService.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: AcuItemDto,
  ) {
    return this.acusService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.acusService.removeItem(id, itemId);
  }
}
