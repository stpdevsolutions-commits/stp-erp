import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 5 del módulo Costos: ACU (Análisis de Costos Unitarios).
 *
 * `acus` es la partida de obra ("salida eléctrica", "m2 de pañete") y `acu_items` la
 * receta: qué insumos consume UNA unidad de ella. La tabla de líneas es polimórfica
 * (material / mano de obra / equipo) en vez de tres tablas paralelas, siguiendo la
 * decisión de la Fase 1: las tres se calculan igual y separarlas obligaría a unir tres
 * consultas para un solo número.
 *
 * **No hay columna de costo.** El unitario se calcula al vuelo con los precios vigentes
 * (`acu-cost.ts`): guardarlo lo congelaría y envejecería en silencio, que es justo el
 * problema que este módulo existe para resolver.
 *
 * Puramente aditiva: crea dos tablas nuevas y no toca ninguna existente.
 */
export class AddAcus1785400000000 implements MigrationInterface {
  name = 'AddAcus1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "acus_trade_enum" AS ENUM ('electrical', 'civil', 'mechanical', 'other');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acus" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "normalizedName" character varying NOT NULL,
        "description" text,
        "unitId" uuid NOT NULL,
        "trade" "acus_trade_enum" NOT NULL DEFAULT 'electrical',
        "chapter" character varying,
        "notes" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_acus" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_acus_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "acu_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acuId" uuid NOT NULL,
        "kind" character varying NOT NULL DEFAULT 'material',
        "materialId" uuid,
        "description" character varying,
        "unitId" uuid,
        "quantity" numeric(16,6) NOT NULL DEFAULT 0,
        "unitCost" numeric(14,4),
        "basis" character varying,
        "pct" numeric(6,2),
        "wastePct" numeric(6,2) NOT NULL DEFAULT 0,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_acu_items" PRIMARY KEY ("id")
      )
    `);

    // RESTRICT en la unidad de la partida: cambiarla a mitad de camino altera el
    // significado de todos sus unitarios (RD$450/m2 no es RD$450/ml).
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "acus" ADD CONSTRAINT "FK_acus_unit"
          FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "acu_items" ADD CONSTRAINT "FK_acu_items_acu"
          FOREIGN KEY ("acuId") REFERENCES "acus"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // RESTRICT, no CASCADE: borrar un material usado en una receta vaciaría partidas en
    // silencio y sus unitarios bajarían sin que nadie lo note. Misma guarda que impide
    // borrar un material con precios.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "acu_items" ADD CONSTRAINT "FK_acu_items_material"
          FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "acu_items" ADD CONSTRAINT "FK_acu_items_unit"
          FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_acus_normalizedName" ON "acus" ("normalizedName")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_acus_chapter" ON "acus" ("chapter")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_acu_items_materialId" ON "acu_items" ("materialId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_acu_items_acuId_sortOrder" ON "acu_items" ("acuId", "sortOrder")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "acu_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acus"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "acus_trade_enum"`);
  }
}
