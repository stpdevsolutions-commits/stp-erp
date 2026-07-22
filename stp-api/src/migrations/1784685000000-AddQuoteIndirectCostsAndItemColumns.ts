import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delta sobre InitialSchema para igualar el schema real (mantenido hasta ahora
 * por synchronize en dev):
 *  - quote_items.discountPct  numeric(5,2) NOT NULL DEFAULT 0
 *  - quote_items.sectionName  varchar NULL
 *  - quotes.indirectCosts     jsonb NULL  (gastos indirectos de construcción)
 *
 * En la BD viva estas columnas YA existen (las creó synchronize); esta migración
 * se marca como aplicada sin ejecutarse. En una BD fresca en modo producción
 * (migrationsRun) sí se ejecuta tras InitialSchema. IF NOT EXISTS la hace
 * idempotente en ambos escenarios.
 */
export class AddQuoteIndirectCostsAndItemColumns1784685000000 implements MigrationInterface {
  name = 'AddQuoteIndirectCostsAndItemColumns1784685000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "discountPct" numeric(5,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "sectionName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "indirectCosts" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "indirectCosts"`);
    await queryRunner.query(`ALTER TABLE "quote_items" DROP COLUMN IF EXISTS "sectionName"`);
    await queryRunner.query(`ALTER TABLE "quote_items" DROP COLUMN IF EXISTS "discountPct"`);
  }
}
