import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revisiones de cotización (rev.2, rev.3…) sin perder la original.
 *
 * Cada revisión es un registro `Quote` propio. Se añaden tres columnas:
 *  - quotes.baseNumber      varchar NOT NULL — número base legible compartido por
 *                           toda la familia (p. ej. `COT-2026-001`). Clave de
 *                           agrupación de la familia de revisiones.
 *  - quotes.revision        int NOT NULL DEFAULT 1 — 1 = original.
 *  - quotes.supersededById  uuid NULL FK→quotes(id) — si está presente, esta
 *                           cotización fue reemplazada por la revisión indicada y
 *                           queda como documento histórico (no editable/reenviable
 *                           /decidible). La revisión VIGENTE de una familia es la
 *                           que tiene supersededById = NULL.
 *
 * Numeración: se conserva el UNIQUE simple sobre `number`. Las revisiones N>1
 * usan el sufijo `-R{n}` (`COT-2026-001-R2`), único y sin romper
 * `generateNumber()` (SPLIT_PART(number,'-',3) sigue siendo la secuencia).
 *
 * BACKFILL: toda cotización existente es la revisión 1 de su propia familia
 * (baseNumber = number, revision = 1) y ninguna queda reemplazada
 * (supersededById = NULL, valor por defecto).
 */
export class AddQuoteRevisions1785000000000 implements MigrationInterface {
  name = 'AddQuoteRevisions1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Columnas ──────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "baseNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "supersededById" uuid`,
    );

    // ── Backfill: cada cotización es la revisión 1 de su propia familia ───
    await queryRunner.query(
      `UPDATE "quotes" SET "baseNumber" = "number" WHERE "baseNumber" IS NULL`,
    );

    // Una vez rellenado, baseNumber es obligatorio.
    await queryRunner.query(
      `ALTER TABLE "quotes" ALTER COLUMN "baseNumber" SET NOT NULL`,
    );

    // ── FK auto-referencial (idempotente) ─────────────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_quotes_supersededBy'
        ) THEN
          ALTER TABLE "quotes"
            ADD CONSTRAINT "FK_quotes_supersededBy" FOREIGN KEY ("supersededById")
            REFERENCES "quotes"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ── Índices ───────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotes_baseNumber" ON "quotes" ("baseNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotes_supersededById" ON "quotes" ("supersededById")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quotes_supersededById"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quotes_baseNumber"`);
    await queryRunner.query(
      `ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "FK_quotes_supersededBy"`,
    );
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "supersededById"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "revision"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "baseNumber"`);
  }
}
