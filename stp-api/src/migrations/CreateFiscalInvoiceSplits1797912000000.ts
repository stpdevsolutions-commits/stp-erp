import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-81: dividir una factura fiscal entre varios proyectos y gasto general.
 *
 * Tabla nueva `fiscal_invoice_splits` (una fila por destino, con su propio gasto). Las facturas
 * existentes no se tocan: sin filas aquí siguen usando `fiscal_invoices.expenseId` como hasta hoy.
 *
 * - `fiscalInvoiceId` ON DELETE CASCADE: borrar la factura borra su reparto (los gastos que
 *   nacieron del reparto los borra el servicio, igual que con el gasto único).
 * - `projectId` ON DELETE RESTRICT, como `expenses.projectId` (ERP-62): un proyecto con reparto
 *   no se puede borrar por debajo.
 * - `expenseId` ON DELETE SET NULL: si alguien borra a mano el gasto de una línea, el reparto se conserva.
 * - Un destino no se repite por factura (dos índices únicos parciales, porque NULL no cuenta como igual).
 */
export class CreateFiscalInvoiceSplits1797912000000 implements MigrationInterface {
  name = 'CreateFiscalInvoiceSplits1797912000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fiscal_invoice_splits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fiscalInvoiceId" uuid NOT NULL,
        "projectId" uuid,
        "amount" numeric(14,2) NOT NULL,
        "note" text,
        "expenseId" uuid,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fiscal_invoice_splits" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_fiscal_invoice_splits_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_fiscal_invoice_splits_invoice" FOREIGN KEY ("fiscalInvoiceId")
          REFERENCES "fiscal_invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fiscal_invoice_splits_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_fiscal_invoice_splits_expense" FOREIGN KEY ("expenseId")
          REFERENCES "expenses"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fiscal_invoice_splits_project" ON "fiscal_invoice_splits" ("fiscalInvoiceId", "projectId") WHERE "projectId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fiscal_invoice_splits_general" ON "fiscal_invoice_splits" ("fiscalInvoiceId") WHERE "projectId" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_fiscal_invoice_splits_expense" ON "fiscal_invoice_splits" ("expenseId")`);
    await queryRunner.query(`CREATE INDEX "IDX_fiscal_invoice_splits_project" ON "fiscal_invoice_splits" ("projectId")`);
  }

  /**
   * Quita la tabla. Los gastos que ya nacieron de un reparto se quedan en Gastos (sin factura
   * enlazada): bajar esta migración con facturas divididas no borra dinero, pero esas facturas
   * vuelven a verse "sin asignar" hasta que se les dé un destino.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fiscal_invoice_splits"`);
  }
}
