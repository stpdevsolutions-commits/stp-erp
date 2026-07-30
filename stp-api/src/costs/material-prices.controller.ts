import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { MaterialPricesService } from './material-prices.service';
import { VoidMaterialPriceDto } from './dto/void-material-price.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

interface AuthUser {
  id: string;
  role: UserRole;
}

/**
 * Operaciones sobre un precio concreto. No hay PATCH ni DELETE: el historial de precios
 * es append-only y un precio equivocado se ANULA (dejando rastro) y se reemplaza por otro.
 */
@Controller('costs/prices')
@UseGuards(JwtAuthGuard)
export class MaterialPricesController {
  constructor(private readonly pricesService: MaterialPricesService) {}

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricesService.findOne(id);
  }

  @Post(':id/void')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER)
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidMaterialPriceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pricesService.void(id, dto, user.id);
  }
}
