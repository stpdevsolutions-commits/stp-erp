import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notas de crédito (e-CF 34) como filas de `sales_invoices` que apuntan a la factura que
 * modifican, y el último mensaje de la DGII sobre el comprobante.
 */
export class AddCreditNotesToSalesInvoices1797500000000 implements MigrationInterface {
  name = 'AddCreditNotesToSalesInvoices1797500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "sales_invoices_kind_enum" AS ENUM ('invoice', 'credit_note')`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" ADD "kind" "sales_invoices_kind_enum" NOT NULL DEFAULT 'invoice'`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" ADD "relatedInvoiceId" uuid`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" ADD "modificationCode" integer`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" ADD "reason" character varying(90)`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" ADD "ecfMensaje" text`);
    await queryRunner.query(`
      ALTER TABLE "sales_invoices" ADD CONSTRAINT "FK_sales_invoices_related"
        FOREIGN KEY ("relatedInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sales_invoices_related" ON "sales_invoices" ("relatedInvoiceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_sales_invoices_related"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP CONSTRAINT "FK_sales_invoices_related"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN "ecfMensaje"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN "reason"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN "modificationCode"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN "relatedInvoiceId"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN "kind"`);
    await queryRunner.query(`DROP TYPE "sales_invoices_kind_enum"`);
  }
}
