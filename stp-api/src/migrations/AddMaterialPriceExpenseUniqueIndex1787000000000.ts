import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `MaterialPricesService.syncFromExpense` leía "¿ya hay un precio derivado activo
 * para este gasto?" y decidía insertar uno nuevo si no. Dos llamadas concurrentes
 * (doble guardado, reintento de red) podían leer ambas que no existía y terminar
 * creando dos precios activos para el mismo gasto. Este índice único parcial hace
 * que la base rechace el segundo en vez de dejarlo pasar.
 */
export class AddMaterialPriceExpenseUniqueIndex1787000000000 implements MigrationInterface {
  name = 'AddMaterialPriceExpenseUniqueIndex1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_material_prices_expense_active" ON "material_prices" ("expenseId") WHERE "voidedAt" IS NULL AND "expenseId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_material_prices_expense_active"`);
  }
}
