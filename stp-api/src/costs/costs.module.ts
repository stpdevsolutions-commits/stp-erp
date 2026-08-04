import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Unit } from './entities/unit.entity';
import { MaterialCategory } from './entities/material-category.entity';
import { Material } from './entities/material.entity';
import { MaterialPrice } from './entities/material-price.entity';
import { Acu } from './entities/acu.entity';
import { AcuItem } from './entities/acu-item.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { UnitsService } from './units.service';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialsService } from './materials.service';
import { MaterialPricesService } from './material-prices.service';
import { AcusService } from './acus.service';
import { UnitsController } from './units.controller';
import { MaterialCategoriesController } from './material-categories.controller';
import { MaterialsController } from './materials.controller';
import { MaterialPricesController } from './material-prices.controller';
import { AcusController } from './acus.controller';

/**
 * Módulo Costos:
 * - Fase 1: catálogo maestro (unidades, categorías, materiales) e historial de precios
 *   append-only. Lógica pura en `price-selection.ts`.
 * - Fase 5: ACU, partidas de obra descompuestas en insumos. Lógica pura en `acu-cost.ts`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Unit,
      MaterialCategory,
      Material,
      MaterialPrice,
      Acu,
      AcuItem,
      Supplier,
    ]),
  ],
  providers: [
    UnitsService,
    MaterialCategoriesService,
    MaterialsService,
    MaterialPricesService,
    AcusService,
  ],
  controllers: [
    UnitsController,
    MaterialCategoriesController,
    MaterialsController,
    MaterialPricesController,
    AcusController,
  ],
  exports: [MaterialsService, MaterialPricesService, AcusService],
})
export class CostsModule {}
