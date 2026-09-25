import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-89 + ERP-90: tipo de colaborador (Fijo/Contratista/Temporero) y código
 * correlativo único por tipo (F-001, C-001, T-001).
 *
 * El código se genera con una secuencia de Postgres dedicada por tipo (atómica
 * ante creaciones concurrentes) en vez de contarlo en la aplicación. Los 18
 * colaboradores existentes no tienen ningún dato de tipo previo: quedan todos
 * en "fixed" por defecto (F-001..F-018, en orden de creación) y su secuencia
 * arranca en 19. Pedro debe revisar y reclasificar los que correspondan desde
 * el formulario de edición (el tipo no es editable después de creado, ver
 * UpdateCollaboratorDto, así que una reclasificación real implica dar de baja
 * y crear un registro nuevo).
 */
export class AddCollaboratorTypeAndCode1792000000000 implements MigrationInterface {
  name = 'AddCollaboratorTypeAndCode1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "collaborators_type_enum" AS ENUM ('fixed', 'contractor', 'temporary');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "collaborators"
        ADD COLUMN IF NOT EXISTS "type" "collaborators_type_enum" NOT NULL DEFAULT 'fixed'
    `);

    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "collaborators_code_seq_fixed"`);
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "collaborators_code_seq_contractor"`);
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "collaborators_code_seq_temporary"`);

    await queryRunner.query(`ALTER TABLE "collaborators" ADD COLUMN IF NOT EXISTS "code" character varying`);

    await queryRunner.query(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn FROM "collaborators"
      )
      UPDATE "collaborators" c
      SET "code" = 'F-' || lpad(ordered.rn::text, 3, '0')
      FROM ordered
      WHERE c.id = ordered.id
    `);

    await queryRunner.query(`
      SELECT setval('collaborators_code_seq_fixed', GREATEST((SELECT count(*) FROM "collaborators"), 0))
    `);

    await queryRunner.query(`ALTER TABLE "collaborators" ALTER COLUMN "code" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "collaborators" ADD CONSTRAINT "UQ_collaborators_code" UNIQUE ("code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collaborators" DROP CONSTRAINT IF EXISTS "UQ_collaborators_code"`);
    await queryRunner.query(`ALTER TABLE "collaborators" DROP COLUMN IF EXISTS "code"`);
    await queryRunner.query(`ALTER TABLE "collaborators" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "collaborators_code_seq_fixed"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "collaborators_code_seq_contractor"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "collaborators_code_seq_temporary"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "collaborators_type_enum"`);
  }
}
