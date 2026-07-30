import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo Costos — Fase 1: catálogo maestro + historial de precios.
 *
 * Tablas:
 *  - units               ← unidades de medida, con base + factor para conversión futura
 *  - material_categories ← árbol de categorías (esqueleto de la biblioteca de partidas)
 *  - materials           ← catálogo maestro, código MAT-00001
 *  - material_prices     ← historial APPEND-ONLY de precios por proveedor/región/fecha
 *
 * Puramente aditiva: no toca ninguna tabla existente. `material_prices.supplierId`
 * apunta a `suppliers` (ON DELETE SET NULL: perder el proveedor no debe borrar el
 * precio histórico). `documentId` es un puntero suelto a `uploaded_files` SIN FK, para
 * no acoplar el módulo a FilesModule ni que dev (synchronize) y prod difieran.
 *
 * SIEMBRA: solo unidades de medida, que son hechos objetivos (1 qq = 45.359237 kg).
 * Categorías y materiales NO se siembran — los códigos de partida los define STP y
 * sembrar precios inventados contaminaría el historial, que es el activo del módulo.
 */
export class AddCostsCatalogAndPrices1785100000000 implements MigrationInterface {
  name = 'AddCostsCatalogAndPrices1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "units_kind_enum" AS ENUM ('count','length','area','volume','mass','time','other');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "material_prices_currency_enum" AS ENUM ('DOP','USD');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "material_prices_region_enum" AS ENUM
          ('santo_domingo','santiago_cibao','este_punta_cana','norte','sur','otra');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "material_prices_source_enum" AS ENUM
          ('manual','supplier_quote','expense','import','external_ref');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── units ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "units" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "kind" "units_kind_enum" NOT NULL DEFAULT 'other',
        "baseUnitId" uuid,
        "factor" numeric(18,8),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_units" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_units_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "units" ADD CONSTRAINT "FK_units_baseUnit"
          FOREIGN KEY ("baseUnitId") REFERENCES "units"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── material_categories ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "material_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "parentId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_material_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_material_categories_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "material_categories" ADD CONSTRAINT "FK_material_categories_parent"
          FOREIGN KEY ("parentId") REFERENCES "material_categories"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── materials ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "materials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "normalizedName" character varying NOT NULL,
        "description" text,
        "categoryId" uuid,
        "unitId" uuid NOT NULL,
        "brand" character varying,
        "model" character varying,
        "barcode" character varying,
        "specs" jsonb,
        "notes" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_materials" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_materials_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_materials_normalizedName" ON "materials" ("normalizedName")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "materials" ADD CONSTRAINT "FK_materials_category"
          FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "materials" ADD CONSTRAINT "FK_materials_unit"
          FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── material_prices ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "material_prices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "materialId" uuid NOT NULL,
        "supplierId" uuid,
        "price" numeric(14,4) NOT NULL,
        "currency" "material_prices_currency_enum" NOT NULL DEFAULT 'DOP',
        "exchangeRate" numeric(12,4),
        "itbisIncluded" boolean NOT NULL DEFAULT false,
        "itbisRate" numeric(5,2) NOT NULL DEFAULT 18,
        "discountPct" numeric(5,2) NOT NULL DEFAULT 0,
        "netUnitPrice" numeric(14,4) NOT NULL,
        "minQuantity" numeric(14,2),
        "region" "material_prices_region_enum" NOT NULL DEFAULT 'santo_domingo',
        "date" date NOT NULL,
        "leadTimeDays" integer,
        "source" "material_prices_source_enum" NOT NULL DEFAULT 'manual',
        "documentId" uuid,
        "notes" text,
        "registeredById" uuid,
        "voidedAt" TIMESTAMP WITH TIME ZONE,
        "voidedById" uuid,
        "voidReason" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_material_prices" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_material_prices_material_date" ON "material_prices" ("materialId", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_material_prices_material_supplier_date" ON "material_prices" ("materialId", "supplierId", "date")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "material_prices" ADD CONSTRAINT "FK_material_prices_material"
          FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "material_prices" ADD CONSTRAINT "FK_material_prices_supplier"
          FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "material_prices" ADD CONSTRAINT "FK_material_prices_registeredBy"
          FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── Siembra de unidades (hechos objetivos, no datos de negocio) ────────
    // Se insertan primero las unidades base y después las derivadas con su factor.
    await queryRunner.query(`
      INSERT INTO "units" ("code", "name", "kind") VALUES
        ('ud',    'Unidad',            'count'),
        ('m',     'Metro',             'length'),
        ('m2',    'Metro cuadrado',    'area'),
        ('m3',    'Metro cúbico',      'volume'),
        ('kg',    'Kilogramo',         'mass'),
        ('l',     'Litro',             'volume'),
        ('h',     'Hora',              'time'),
        ('dia',   'Día',               'time'),
        ('gl',    'Galón',             'volume'),
        ('lb',    'Libra',             'mass'),
        ('qq',    'Quintal',           'mass'),
        ('ton',   'Tonelada métrica',  'mass'),
        ('pie',   'Pie',               'length'),
        ('pulg',  'Pulgada',           'length'),
        ('yd',    'Yarda',             'length'),
        ('yd3',   'Yarda cúbica',      'volume'),
        ('pie2',  'Pie cuadrado',      'area'),
        ('funda', 'Funda',             'count'),
        ('saco',  'Saco',              'count'),
        ('rollo', 'Rollo',             'count'),
        ('caja',  'Caja',              'count'),
        ('juego', 'Juego',             'count'),
        ('par',   'Par',               'count'),
        ('lote',  'Lote',              'count'),
        ('gbl',   'Global',            'other')
      ON CONFLICT ("code") DO NOTHING
    `);

    // Conversiones exactas hacia la unidad base de su tipo.
    const conversions: [string, string, string][] = [
      ['lb', 'kg', '0.45359237'],
      ['qq', 'kg', '45.35923700'],
      ['ton', 'kg', '1000'],
      ['pie', 'm', '0.30480000'],
      ['pulg', 'm', '0.02540000'],
      ['yd', 'm', '0.91440000'],
      ['yd3', 'm3', '0.76455486'],
      ['pie2', 'm2', '0.09290304'],
      ['gl', 'l', '3.78541178'],
      ['l', 'm3', '0.00100000'],
      ['dia', 'h', '8'], // jornada laboral de 8 h: convención de STP, no una constante física
    ];
    for (const [code, base, factor] of conversions) {
      await queryRunner.query(
        `UPDATE "units" SET "baseUnitId" = (SELECT "id" FROM "units" WHERE "code" = $2),
                            "factor" = $3
         WHERE "code" = $1 AND "baseUnitId" IS NULL`,
        [code, base, factor],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "material_prices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "materials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "material_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "units"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "material_prices_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "material_prices_region_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "material_prices_currency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "units_kind_enum"`);
  }
}
