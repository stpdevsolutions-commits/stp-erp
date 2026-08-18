import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motivo del descuento/avance en nómina: texto libre que explica el porqué de
 * `deductions` (avance en efectivo, herramienta, préstamo…). Aditiva y nullable,
 * así que los pagos existentes quedan sin motivo.
 */
export class AddPayrollDiscountReason1786000000000 implements MigrationInterface {
  name = 'AddPayrollDiscountReason1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_entries"
      ADD COLUMN IF NOT EXISTS "discountReason" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_entries" DROP COLUMN IF EXISTS "discountReason"
    `);
  }
}
