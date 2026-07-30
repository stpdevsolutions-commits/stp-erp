import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 del módulo Costos: el puente Gastos → Precios.
 *
 * `expenses` gana el desglose opcional cantidad × unitario (+ unidad y material), que es
 * lo que convierte una compra real de STP en un dato de precio aprovechable. Sin esto,
 * "RD$12,500 en cable" no dice nada del precio del cable.
 *
 * `material_prices` gana `expenseId` para poder identificar el precio derivado de un
 * gasto: al editar el gasto se ANULA el derivado anterior y se inserta el nuevo, en vez
 * de duplicarlos. ON DELETE SET NULL como red de seguridad; el service anula el precio
 * ANTES de borrar el gasto, así que en la práctica nunca queda un huérfano sin marcar.
 *
 * Puramente aditiva y todas las columnas son nullable: los gastos existentes siguen
 * siendo válidos tal cual, solo no alimentan la base de precios.
 */
export class AddExpenseCostBreakdown1785110000000 implements MigrationInterface {
  name = 'AddExpenseCostBreakdown1785110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD COLUMN IF NOT EXISTS "quantity" numeric(14,4),
        ADD COLUMN IF NOT EXISTS "unitPrice" numeric(14,4),
        ADD COLUMN IF NOT EXISTS "unitId" uuid,
        ADD COLUMN IF NOT EXISTS "materialId" uuid,
        ADD COLUMN IF NOT EXISTS "itbisIncluded" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_unit"
          FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_material"
          FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expenses_materialId" ON "expenses" ("materialId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "material_prices" ADD COLUMN IF NOT EXISTS "expenseId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_material_prices_expenseId" ON "material_prices" ("expenseId")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "material_prices" ADD CONSTRAINT "FK_material_prices_expense"
          FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "material_prices" DROP CONSTRAINT IF EXISTS "FK_material_prices_expense"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_material_prices_expenseId"`);
    await queryRunner.query(`ALTER TABLE "material_prices" DROP COLUMN IF EXISTS "expenseId"`);

    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_material"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_unit"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expenses_materialId"`);
    await queryRunner.query(`
      ALTER TABLE "expenses"
        DROP COLUMN IF EXISTS "itbisIncluded",
        DROP COLUMN IF EXISTS "materialId",
        DROP COLUMN IF EXISTS "unitId",
        DROP COLUMN IF EXISTS "unitPrice",
        DROP COLUMN IF EXISTS "quantity"
    `);
  }
}
