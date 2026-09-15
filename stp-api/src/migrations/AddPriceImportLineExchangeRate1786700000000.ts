import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Antes no había dónde guardar la tasa de cambio de una línea en USD extraída de un
 * PDF de proveedor: `MaterialPricesService.create()` exige `exchangeRate` para
 * cualquier moneda distinta a DOP, así que toda línea en USD fallaba al aprobar sin
 * ninguna forma de corregirla. Aditiva y nullable: no aplica a líneas en DOP.
 */
export class AddPriceImportLineExchangeRate1786700000000 implements MigrationInterface {
  name = 'AddPriceImportLineExchangeRate1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "price_import_lines" ADD COLUMN IF NOT EXISTS "exchangeRate" numeric(10,4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "price_import_lines" DROP COLUMN IF EXISTS "exchangeRate"`);
  }
}
