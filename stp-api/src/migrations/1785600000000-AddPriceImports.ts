import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 4 del módulo Costos: importación de precios desde cotizaciones de proveedor en
 * PDF, extraídas con IA.
 *
 * `price_imports` es el lote (un PDF) y `price_import_lines` cada renglón extraído.
 * Las líneas son **borradores**: nacen en `pending` y solo llegan a `material_prices`
 * cuando una persona las aprueba, momento en que `createdPriceId` deja el rastro. Sin
 * ese paso el módulo pasaría de "historial de precios reales" a "lo que dijo un modelo",
 * que es exactamente lo que le quitaría el valor.
 *
 * Cada línea guarda por separado lo que leyó la IA (`rawDescription`, `rawUnit`,
 * `rawCode`) y lo que se va a registrar (`materialId`, `price`, ...), para poder auditar
 * después si un precio raro vino del PDF, del modelo o de la revisión.
 *
 * El PDF no entra en `uploaded_files` (esa tabla exige `clientId` y una cotización de
 * proveedor no es de ningún cliente): se guarda en disco bajo `costs/imports/` y aquí
 * queda su ruta.
 *
 * Puramente aditiva: dos tablas nuevas, ninguna existente se toca.
 */
export class AddPriceImports1785600000000 implements MigrationInterface {
  name = 'AddPriceImports1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "price_imports_status_enum" AS ENUM
          ('pending', 'processing', 'review', 'done', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "price_import_lines_status_enum" AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // Enum propio en vez de reusar el de `material_prices`: comparte los valores pero no
    // el ciclo de vida, y es el nombre que TypeORM espera para esta columna (si difiere,
    // `synchronize` en desarrollo intentaría "arreglarlo" en cada arranque).
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "price_import_lines_currency_enum" AS ENUM ('DOP', 'USD');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_imports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "originalName" character varying NOT NULL,
        "path" character varying NOT NULL,
        "size" integer NOT NULL,
        "status" "price_imports_status_enum" NOT NULL DEFAULT 'pending',
        "supplierId" uuid,
        "documentDate" date,
        "model" character varying,
        "inputTokens" integer NOT NULL DEFAULT 0,
        "outputTokens" integer NOT NULL DEFAULT 0,
        "error" text,
        "notes" text,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_imports" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_import_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "importId" uuid NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "rawDescription" text NOT NULL,
        "rawUnit" character varying,
        "rawCode" character varying,
        "price" numeric(14,4) NOT NULL,
        "currency" "price_import_lines_currency_enum" NOT NULL DEFAULT 'DOP',
        "itbisIncluded" boolean NOT NULL DEFAULT false,
        "discountPct" numeric(5,2) NOT NULL DEFAULT 0,
        "materialId" uuid,
        "matchCount" integer NOT NULL DEFAULT 0,
        "status" "price_import_lines_status_enum" NOT NULL DEFAULT 'pending',
        "createdPriceId" uuid,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_import_lines" PRIMARY KEY ("id")
      )
    `);

    // SET NULL en proveedor y usuario: borrar un proveedor no puede llevarse por delante
    // el rastro de una importación ya aprobada.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "price_imports" ADD CONSTRAINT "FK_price_imports_supplier"
          FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "price_imports" ADD CONSTRAINT "FK_price_imports_created_by"
          FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // CASCADE: las líneas no significan nada sin su lote.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "price_import_lines" ADD CONSTRAINT "FK_price_import_lines_import"
          FOREIGN KEY ("importId") REFERENCES "price_imports"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "price_import_lines" ADD CONSTRAINT "FK_price_import_lines_material"
          FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // SET NULL y no CASCADE: si el precio generado se borrara, la línea debe seguir
    // existiendo como registro de que se aprobó. Los precios además nunca se borran
    // (append-only), así que esto es solo un cinturón de seguridad.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "price_import_lines" ADD CONSTRAINT "FK_price_import_lines_price"
          FOREIGN KEY ("createdPriceId") REFERENCES "material_prices"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_price_imports_status" ON "price_imports" ("status")
    `);

    // La consulta natural es "dame el lote con sus líneas en orden".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_price_import_lines_import"
        ON "price_import_lines" ("importId", "position")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "price_import_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_imports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_import_lines_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_import_lines_currency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_imports_status_enum"`);
  }
}
