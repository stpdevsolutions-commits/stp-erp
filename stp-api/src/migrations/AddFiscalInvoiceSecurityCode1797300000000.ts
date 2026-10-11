import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-37: código de seguridad del e-CF. La DGII lo pide (junto con el RNC del comprador)
 * para confirmar un e-NCF, y viene en el QR del comprobante. Nulo en los NCF de papel.
 */
export class AddFiscalInvoiceSecurityCode1797300000000 implements MigrationInterface {
  name = 'AddFiscalInvoiceSecurityCode1797300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fiscal_invoices" ADD "securityCode" character varying(16)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fiscal_invoices" DROP COLUMN "securityCode"`);
  }
}
