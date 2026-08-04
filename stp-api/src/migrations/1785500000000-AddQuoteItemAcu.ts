import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 6: el unitario de una línea de cotización puede nacer de una partida de costos
 * (ACU) en vez de escribirse a mano.
 *
 * Lo que se guarda aquí es el CONGELADO, no un enlace vivo: `acuUnitCost` es el costo
 * directo del día en que se cotizó y `acuPricedAt` cuándo fue. Es deliberadamente lo
 * contrario del ACU, donde el costo NO se guarda y se recalcula siempre: una cotización
 * ya enviada a un cliente no puede cambiar de precio sola. El desfase contra el costo de
 * hoy se AVISA (`acu-pricing.ts`) y actualizarlo es una decisión humana explícita
 * (`POST /quotes/:id/acu-refresh`).
 *
 * Todas las columnas son nullable y no hay backfill: las líneas que ya existen se
 * escribieron a mano y así se quedan. `acuIncomplete` es la única NOT NULL porque su
 * ausencia sí tiene significado (false = el ACU estaba completo al congelar).
 *
 * La FK es RESTRICT, igual que `FK_acu_items_material`: si borrar un ACU pusiera a NULL
 * el origen de un precio ya cotizado, el número seguiría ahí pero nadie podría decir de
 * dónde salió. Para retirar una partida de circulación está `isActive`.
 */
export class AddQuoteItemAcu1785500000000 implements MigrationInterface {
  name = 'AddQuoteItemAcu1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quote_items"
        ADD COLUMN IF NOT EXISTS "acuId" uuid,
        ADD COLUMN IF NOT EXISTS "acuUnitCost" numeric(14,4),
        ADD COLUMN IF NOT EXISTS "acuMarkupPct" numeric(6,2),
        ADD COLUMN IF NOT EXISTS "acuPricedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "acuIncomplete" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "quote_items" ADD CONSTRAINT "FK_quote_items_acu"
          FOREIGN KEY ("acuId") REFERENCES "acus"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // Se consulta al revés de lo habitual: "¿qué líneas dependen de este ACU?" (aviso de
    // desfase, y el RESTRICT al intentar borrarlo). Parcial porque la enorme mayoría de
    // las líneas no vienen de un ACU y no tiene sentido indexarlas.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_quote_items_acuId"
        ON "quote_items" ("acuId") WHERE "acuId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_items_acuId"`);
    await queryRunner.query(
      `ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "FK_quote_items_acu"`,
    );
    await queryRunner.query(`
      ALTER TABLE "quote_items"
        DROP COLUMN IF EXISTS "acuIncomplete",
        DROP COLUMN IF EXISTS "acuPricedAt",
        DROP COLUMN IF EXISTS "acuMarkupPct",
        DROP COLUMN IF EXISTS "acuUnitCost",
        DROP COLUMN IF EXISTS "acuId"
    `);
  }
}
