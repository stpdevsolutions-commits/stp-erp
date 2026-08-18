import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retención en los pagos de nómina: un porcentaje del bruto que se descuenta de
 * lo que se entrega en mano (`netAmount = bruto − descuentos − retención`).
 *
 * `retentionPercent` es lo que escribe el usuario (2 %, 3 %…) y
 * `retentionAmount` el importe que calcula el servidor a partir de él; se guarda
 * en vez de recalcularse al vuelo para que el recibo ya impreso y el pago
 * registrado no cambien si mañana se toca la fórmula.
 *
 * Aditiva: ambas columnas nacen con DEFAULT 0, así que los pagos existentes
 * quedan sin retención y su neto no cambia.
 */
export class AddPayrollRetention1785900000000 implements MigrationInterface {
  name = 'AddPayrollRetention1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_entries"
      ADD COLUMN IF NOT EXISTS "retentionPercent" numeric(5,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_entries"
      ADD COLUMN IF NOT EXISTS "retentionAmount" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_entries" DROP COLUMN IF EXISTS "retentionAmount"
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_entries" DROP COLUMN IF EXISTS "retentionPercent"
    `);
  }
}
