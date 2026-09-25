import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { MaterialPricesService } from './material-prices.service';
import { VoidMaterialPriceDto } from './dto/void-material-price.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  role: UserRole;
}

/**
 * Operaciones sobre un precio concreto. No hay PATCH ni DELETE: el historial de precios
 * es append-only y un precio equivocado se ANULA (dejando rastro) y se reemplaza por otro.
 *
 * Modulo 'costos' (ERP-83/ERP-85): admin/manager = manage, finanza = view, user = ninguno.
 */
@Controller('costs/prices')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
@RequireModule('costos', 'view')
export class MaterialPricesController {
  constructor(private readonly pricesService: MaterialPricesService) {}

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricesService.findOne(id);
  }

  @Post(':id/void')
  @RequireModule('costos', 'manage')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidMaterialPriceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pricesService.void(id, dto, user.id);
  }
}
