import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase B — Informes de proyecto (interno y de cliente), con parte editable.
 *
 * `project_reports` guarda ÚNICAMENTE lo que redacta una persona: título,
 * introducción, observaciones, conclusiones, secciones de texto libres, los
 * conceptos añadidos a mano y las casillas de incluir/excluir bloques.
 *
 * Lo que NO está aquí, a propósito: gastos, cobros, balance, porcentajes de
 * presupuesto ni margen. Esas cifras se recalculan desde la base de datos en
 * cada impresión. Si se guardaran, el informe podría contradecir a los gastos
 * reales en cuanto alguien corrigiera uno — y un informe que miente es peor que
 * no tener informe. Para arreglar una cifra se arregla el gasto o el pago.
 *
 * Una fila por proyecto × tipo (índice único): reimprimir no obliga a
 * reescribir las observaciones.
 *
 * Puramente aditiva: una tabla y un enum nuevos, nada existente se toca.
 */
export class AddProjectReports1785700000000 implements MigrationInterface {
  name = 'AddProjectReports1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "project_reports_type_enum" AS ENUM ('internal', 'client');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "projectId" uuid NOT NULL,
        "type" "project_reports_type_enum" NOT NULL,
        "title" character varying,
        "intro" text,
        "observations" text,
        "conclusions" text,
        "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "manualItems" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "include" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updatedById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_reports" PRIMARY KEY ("id")
      )
    `);

    // CASCADE: el informe no significa nada sin su proyecto.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "project_reports" ADD CONSTRAINT "FK_project_reports_project"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // SET NULL: borrar el usuario que editó por última vez no puede llevarse el informe.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "project_reports" ADD CONSTRAINT "FK_project_reports_updated_by"
          FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // Una sola fila por proyecto y tipo: es la clave de que lo editado persista
    // y de que el upsert del servicio no pueda duplicar informes.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_project_reports_project_type"
        ON "project_reports" ("projectId", "type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_project_reports_project_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_reports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "project_reports_type_enum"`);
  }
}
