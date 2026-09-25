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
import { MaterialsService } from './materials.service';
import { MaterialPricesService } from './material-prices.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { CreateMaterialPriceDto } from './dto/create-material-price.dto';
import { QueryMaterialPricesDto } from './dto/query-material-prices.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  role: UserRole;
}

/** Modulo 'costos' (ERP-83/ERP-85): admin/manager = manage, finanza = view, user = ninguno. */
@Controller('costs/materials')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('costos', 'view')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly pricesService: MaterialPricesService,
  ) {}

  @Post()
  @RequireModule('costos', 'manage')
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryMaterialsDto) {
    return this.materialsService.findAll(query);
  }

  /**
   * Se declara ANTES de `:id` a propósito: Nest resuelve por orden de declaración y
   * `@Get(':id')` capturaría "similar" (mismo patrón que quotes-public.controller).
   */
  @Get('similar')
  findSimilar(@Query('name') name: string) {
    return this.materialsService.findSimilar(name ?? '');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.findOne(id);
  }

  @Patch(':id')
  @RequireModule('costos', 'manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.remove(id);
  }

  // --- Precios del material (append-only: no hay PATCH ni DELETE) ---

  @Post(':id/prices')
  @RequireModule('costos', 'manage')
  addPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMaterialPriceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pricesService.create(id, dto, user.id);
  }

  @Get(':id/prices')
  listPrices(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryMaterialPricesDto) {
    return this.pricesService.findAll(id, query);
  }

  /** Vigente, mín./máx./promedio, variación y comparación entre proveedores. */
  @Get(':id/prices/report')
  priceReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricesService.report(id);
  }
}
