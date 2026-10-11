import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-50: una factura puede vincularse a un gasto que ya existía (tecleado a mano). Ese gasto
 * no nació de la factura: no se sincroniza con ella ni se borra con ella. Las facturas actuales
 * crearon su gasto, así que quedan en `true`.
 */
export class AddExpenseOwnedToFiscalInvoices1797600000000 implements MigrationInterface {
  name = 'AddExpenseOwnedToFiscalInvoices1797600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fiscal_invoices" ADD "expenseOwned" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fiscal_invoices" DROP COLUMN "expenseOwned"`);
  }
}
