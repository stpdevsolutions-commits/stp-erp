import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-35: facturas fiscales (comprobantes de compra del Formato 606), traídas de
 * FiscoRD. El proyecto no se guarda aquí: lo da el gasto enlazado (expenseId).
 */
export class CreateFiscalInvoices1797200000000 implements MigrationInterface {
  name = 'CreateFiscalInvoices1797200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fiscal_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ncf" character varying(13) NOT NULL,
        "ncfType" character varying(3) NOT NULL,
        "supplierRnc" character varying(11) NOT NULL,
        "supplierName" character varying(255) NOT NULL,
        "baseAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "itbis" numeric(14,2) NOT NULL DEFAULT 0,
        "isc" numeric(14,2) NOT NULL DEFAULT 0,
        "tip" numeric(14,2) NOT NULL DEFAULT 0,
        "otherTax" numeric(14,2) NOT NULL DEFAULT 0,
        "totalAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "paymentMethod" character varying(2) NOT NULL DEFAULT '01',
        "expenseType" character varying(2) NOT NULL,
        "invoiceDate" date NOT NULL,
        "notes" text,
        "photoPath" text,
        "photoMimetype" character varying(50),
        "dgiiEstado" character varying(50),
        "dgiiValidatedAt" TIMESTAMP WITH TIME ZONE,
        "expenseId" uuid,
        "legacyId" character varying(64),
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fiscal_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fiscal_invoices_expense" FOREIGN KEY ("expenseId")
          REFERENCES "expenses"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_fiscal_invoices_createdBy" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fiscal_invoices_supplier_ncf" ON "fiscal_invoices" ("supplierRnc", "ncf")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fiscal_invoices_legacy" ON "fiscal_invoices" ("legacyId") WHERE "legacyId" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_fiscal_invoices_date" ON "fiscal_invoices" ("invoiceDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_fiscal_invoices_expense" ON "fiscal_invoices" ("expenseId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fiscal_invoices"`);
  }
}
