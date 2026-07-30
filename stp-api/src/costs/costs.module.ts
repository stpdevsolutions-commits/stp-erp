import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Unit } from './entities/unit.entity';
import { MaterialCategory } from './entities/material-category.entity';
import { Material } from './entities/material.entity';
import { MaterialPrice } from './entities/material-price.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { UnitsService } from './units.service';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialsService } from './materials.service';
import { MaterialPricesService } from './material-prices.service';
import { UnitsController } from './units.controller';
import { MaterialCategoriesController } from './material-categories.controller';
import { MaterialsController } from './materials.controller';
import { MaterialPricesController } from './material-prices.controller';

/**
 * Módulo Costos — Fase 1: catálogo maestro (unidades, categorías, materiales) e
 * historial de precios append-only. Ver `price-selection.ts` para la lógica pura.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Unit, MaterialCategory, Material, MaterialPrice, Supplier])],
  providers: [UnitsService, MaterialCategoriesService, MaterialsService, MaterialPricesService],
  controllers: [
    UnitsController,
    MaterialCategoriesController,
    MaterialsController,
    MaterialPricesController,
  ],
  exports: [MaterialsService, MaterialPricesService],
})
export class CostsModule {}
