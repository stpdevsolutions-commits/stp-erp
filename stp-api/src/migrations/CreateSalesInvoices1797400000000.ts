import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Facturas de venta con e-CF (pestaña "Emitidas" de Facturas). La factura es el
 * documento de venta; los cobros (`payments`) se le aplican como abonos mediante
 * `payments.salesInvoiceId`, para no emitir ni contar dos veces lo mismo.
 */
export class CreateSalesInvoices1797400000000 implements MigrationInterface {
  name = 'CreateSalesInvoices1797400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "sales_invoices_status_enum" AS ENUM ('draft', 'emitting', 'issued')`,
    );
    await queryRunner.query(`
      CREATE TABLE "sales_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "number" character varying NOT NULL,
        "clientId" uuid NOT NULL,
        "projectId" uuid,
        "quoteId" uuid,
        "quotePercent" numeric(5,2),
        "issueDate" date NOT NULL,
        "dueDate" date,
        "notes" text,
        "status" "sales_invoices_status_enum" NOT NULL DEFAULT 'draft',
        "subtotal" numeric(14,2) NOT NULL DEFAULT 0,
        "itbis" numeric(14,2) NOT NULL DEFAULT 0,
        "total" numeric(14,2) NOT NULL DEFAULT 0,
        "ecfId" character varying,
        "ecfEncf" character varying,
        "ecfTipo" character varying,
        "ecfUuid" character varying,
        "ecfEstado" character varying,
        "ecfCodigoSeguridad" character varying,
        "ecfQrUrl" text,
        "ecfError" text,
        "ecfEmitidoAt" TIMESTAMP WITH TIME ZONE,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sales_invoices_number" UNIQUE ("number"),
        CONSTRAINT "FK_sales_invoices_client" FOREIGN KEY ("clientId")
          REFERENCES "clients"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_sales_invoices_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sales_invoices_quote" FOREIGN KEY ("quoteId")
          REFERENCES "quotes"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_sales_invoices_createdBy" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sales_invoices_client" ON "sales_invoices" ("clientId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_invoices_project" ON "sales_invoices" ("projectId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_invoices_quote" ON "sales_invoices" ("quoteId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_invoices_date" ON "sales_invoices" ("issueDate")`);
    // Un e-NCF no puede estar en dos facturas.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sales_invoices_encf" ON "sales_invoices" ("ecfEncf") WHERE "ecfEncf" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "sales_invoice_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoiceId" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "description" character varying NOT NULL,
        "quantity" numeric(12,2) NOT NULL DEFAULT 1,
        "unit" character varying,
        "unitPrice" numeric(14,2) NOT NULL,
        "itbisRate" numeric(5,2) NOT NULL DEFAULT 18,
        "goodOrService" integer NOT NULL DEFAULT 2,
        "total" numeric(14,2) NOT NULL DEFAULT 0,
        "itbisAmount" numeric(14,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_sales_invoice_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_invoice_lines_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "sales_invoices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sales_invoice_lines_invoice" ON "sales_invoice_lines" ("invoiceId")`,
    );

    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "salesInvoiceId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_sales_invoice"
        FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payments_sales_invoice" ON "payments" ("salesInvoiceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payments_sales_invoice"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_sales_invoice"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "salesInvoiceId"`);
    await queryRunner.query(`DROP TABLE "sales_invoice_lines"`);
    await queryRunner.query(`DROP TABLE "sales_invoices"`);
    await queryRunner.query(`DROP TYPE "sales_invoices_status_enum"`);
  }
}
