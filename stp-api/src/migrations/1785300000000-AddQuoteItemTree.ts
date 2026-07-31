import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partidas anidables en las cotizaciones: "Baño" → "Piso" → "Materiales" → líneas.
 *
 * Antes solo había un nivel, guardado como texto suelto en `quote_items.sectionName`.
 * Ahora `quote_items` es un árbol: `parentId` (auto-referencia, CASCADE) y `kind`
 * ('group' = agrupa y su total es la suma de los hijos; 'item' = línea con cantidad
 * × unitario).
 *
 * El backfill CONVIERTE las partidas de texto que ya existen en filas 'group'
 * reales, una por cada (cotización, sectionName), y cuelga de ellas sus líneas.
 * `sortOrder` pasa a ser el orden ENTRE HERMANOS, no global, así que se renumera
 * por grupo respetando el orden que tenían.
 *
 * `sectionName` se elimina al final: con el árbol sería una segunda fuente de
 * verdad de la misma información. El `down()` la reconstruye desde el árbol.
 */
export class AddQuoteItemTree1785300000000 implements MigrationInterface {
  name = 'AddQuoteItemTree1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quote_items"
        ADD COLUMN IF NOT EXISTS "parentId" uuid,
        ADD COLUMN IF NOT EXISTS "kind" character varying NOT NULL DEFAULT 'item'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "quote_items" ADD CONSTRAINT "FK_quote_items_parent"
          FOREIGN KEY ("parentId") REFERENCES "quote_items"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quote_items_parentId" ON "quote_items" ("parentId")`,
    );

    const hasSectionName = await queryRunner.query(`
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'quote_items' AND column_name = 'sectionName'
    `);
    if (hasSectionName.length === 0) return; // Ya migrado.

    // 1. Una fila 'group' por cada partida de texto existente, conservando el
    //    orden de aparición (el menor sortOrder de sus líneas).
    await queryRunner.query(`
      INSERT INTO "quote_items"
        ("quoteId", "kind", "description", "quantity", "unitPrice", "discountPct",
         "total", "sortOrder", "parentId")
      SELECT
        s."quoteId",
        'group',
        s."sectionName",
        0, 0, 0,
        s."total",
        ROW_NUMBER() OVER (PARTITION BY s."quoteId" ORDER BY s."minOrder") - 1,
        NULL
      FROM (
        SELECT "quoteId",
               "sectionName",
               MIN("sortOrder") AS "minOrder",
               SUM("total")     AS "total"
          FROM "quote_items"
         WHERE "sectionName" IS NOT NULL AND "sectionName" <> ''
         GROUP BY "quoteId", "sectionName"
      ) s
    `);

    // 2. Colgar cada línea de su grupo. Se identifican por (quoteId, descripción
    //    del grupo = sectionName) y se excluyen los grupos recién creados.
    await queryRunner.query(`
      UPDATE "quote_items" i
         SET "parentId" = g."id"
        FROM "quote_items" g
       WHERE g."kind" = 'group'
         AND i."kind" <> 'group'
         AND i."quoteId" = g."quoteId"
         AND i."sectionName" = g."description"
    `);

    // 3. sortOrder pasa a ser relativo a los hermanos.
    await queryRunner.query(`
      WITH ordered AS (
        SELECT "id",
               ROW_NUMBER() OVER (
                 PARTITION BY "quoteId", COALESCE("parentId"::text, 'root')
                 ORDER BY "sortOrder", "createdAt"
               ) - 1 AS "newOrder"
          FROM "quote_items"
         WHERE "kind" <> 'group'
      )
      UPDATE "quote_items" i
         SET "sortOrder" = o."newOrder"
        FROM ordered o
       WHERE o."id" = i."id"
    `);

    await queryRunner.query(`ALTER TABLE "quote_items" DROP COLUMN "sectionName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "sectionName" character varying`,
    );

    // Se recupera el nombre de la partida de PRIMER nivel de cada línea; los
    // niveles intermedios no caben en una columna de texto y se pierden.
    await queryRunner.query(`
      WITH RECURSIVE up AS (
        SELECT "id", "parentId", "description", "id" AS "leafId"
          FROM "quote_items" WHERE "kind" <> 'group'
        UNION ALL
        SELECT p."id", p."parentId", p."description", u."leafId"
          FROM "quote_items" p JOIN up u ON u."parentId" = p."id"
      )
      UPDATE "quote_items" i
         SET "sectionName" = r."description"
        FROM (SELECT DISTINCT ON ("leafId") "leafId", "description"
                FROM up WHERE "parentId" IS NULL) r
       WHERE i."id" = r."leafId"
    `);

    await queryRunner.query(`DELETE FROM "quote_items" WHERE "kind" = 'group'`);
    await queryRunner.query(`ALTER TABLE "quote_items" DROP CONSTRAINT IF EXISTS "FK_quote_items_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_items_parentId"`);
    await queryRunner.query(`
      ALTER TABLE "quote_items"
        DROP COLUMN IF EXISTS "kind",
        DROP COLUMN IF EXISTS "parentId"
    `);
  }
}
