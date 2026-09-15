import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tipo de pago de una línea de nómina: por día (como hasta ahora) o por
 * ajuste — m², m³, ml o P.A. (Partida Alzada / monto fijo).
 *
 * No hace falta ninguna columna nueva de importe: `daysWorked` y `dailyRate`
 * pasan a leerse como "cantidad" y "tarifa unitaria" genéricas según este
 * campo (cantidad × tarifa es la misma cuenta sea la unidad días, m², m³ o
 * ml). Para P.A. la cantidad queda fija en 1 y `dailyRate` guarda el monto
 * escrito a mano. Aditivo: default 'day' deja las filas existentes
 * exactamente como estaban.
 */
export class AddPayrollPaymentType1786500000000 implements MigrationInterface {
  name = 'AddPayrollPaymentType1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payroll_entries_paymenttype_enum" AS ENUM ('day', 'm2', 'm3', 'ml', 'lump_sum');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "payroll_entries"
        ADD COLUMN IF NOT EXISTS "paymentType" "payroll_entries_paymenttype_enum" NOT NULL DEFAULT 'day'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payroll_entries" DROP COLUMN IF EXISTS "paymentType"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payroll_entries_paymenttype_enum"`);
  }
}
