import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobros vencidos: un pago PENDIENTE puede llevar fecha de vencimiento
 * (`dueDate`). Cuando pasa sin cobrarse, el scheduler avisa una sola vez
 * (`overdueNotifiedAt`). Aditiva y nullable: los pagos existentes no cambian.
 */
export class AddPaymentDueDate1797000000000 implements MigrationInterface {
  name = 'AddPaymentDueDate1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "dueDate" date`);
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "overdueNotifiedAt" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TYPE "notifications_inapp_type_enum" ADD VALUE IF NOT EXISTS 'payment_overdue'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "overdueNotifiedAt"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "dueDate"`);
    // Un valor de enum no se puede quitar en Postgres sin recrear el tipo; se deja.
  }
}
