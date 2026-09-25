import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MOB-1: calculadora de materiales de la app de técnicos. Puramente aditiva:
 * dos tablas nuevas, nada existente se toca.
 *  - material_calcs: cálculos guardados en un proyecto (con su PDF archivado).
 *  - calc_material_links: qué material del catálogo le da precio a cada insumo.
 */
export class AddMaterialCalcs1795000000000 implements MigrationInterface {
  name = 'AddMaterialCalcs1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "material_calcs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "projectId" uuid NOT NULL,
        "calculatorId" character varying(40) NOT NULL,
        "title" character varying(120) NOT NULL,
        "inputs" jsonb NOT NULL,
        "result" jsonb NOT NULL,
        "totalMaterials" numeric(14,2),
        "fileId" uuid,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_material_calcs_projectId" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_material_calcs_fileId" FOREIGN KEY ("fileId")
          REFERENCES "uploaded_files"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_material_calcs_createdById" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_material_calcs_project_created"
        ON "material_calcs" ("projectId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "calc_material_links" (
        "clave" character varying(80) PRIMARY KEY,
        "materialId" uuid NOT NULL,
        "updatedById" uuid,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_calc_material_links_materialId" FOREIGN KEY ("materialId")
          REFERENCES "materials"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "calc_material_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "material_calcs"`);
  }
}
