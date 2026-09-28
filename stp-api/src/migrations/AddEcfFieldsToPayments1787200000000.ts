import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Campos del comprobante fiscal electrónico (e-CF) emitido para un pago.
 * El e-CF vive en ecf-api (base de datos aparte); aquí solo guardamos el
 * enlace y los datos que hay que mostrar en el ERP (eNCF, UUID DGII, estado,
 * QR). `ecfId` es el id del comprobante en ecf-api. Todo nullable: un pago
 * puede no tener e-CF (no todos se facturan electrónicamente).
 */
export class AddEcfFieldsToPayments1787200000000
  implements MigrationInterface
{
  name = 'AddEcfFieldsToPayments1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN "ecfId" uuid NULL,
        ADD COLUMN "ecfEncf" character varying NULL,
        ADD COLUMN "ecfTipo" character varying NULL,
        ADD COLUMN "ecfUuid" character varying NULL,
        ADD COLUMN "ecfEstado" character varying NULL,
        ADD COLUMN "ecfCodigoSeguridad" character varying NULL,
        ADD COLUMN "ecfQrUrl" text NULL,
        ADD COLUMN "ecfError" text NULL,
        ADD COLUMN "ecfEmitidoAt" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN "ecfEmitidoAt",
        DROP COLUMN "ecfError",
        DROP COLUMN "ecfQrUrl",
        DROP COLUMN "ecfCodigoSeguridad",
        DROP COLUMN "ecfEstado",
        DROP COLUMN "ecfUuid",
        DROP COLUMN "ecfTipo",
        DROP COLUMN "ecfEncf",
        DROP COLUMN "ecfId"
    `);
  }
}
