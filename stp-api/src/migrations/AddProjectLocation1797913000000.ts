import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-80: ubicación GPS del proyecto. `latitude`/`longitude` en grados decimales
 * (numeric(9,6) ≈ 0,1 m) y `locationNote` con la dirección o referencia para llegar.
 * Las tres son opcionales; la regla "ambas coordenadas o ninguna" la aplica
 * `ProjectsService.assertCoords` (y los rangos, los DTOs). Se usa IF NOT EXISTS / IF EXISTS
 * para que la migración sea re-ejecutable sin romper.
 */
export class AddProjectLocation1797913000000 implements MigrationInterface {
  name = 'AddProjectLocation1797913000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "latitude" numeric(9,6)`);
    await queryRunner.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "longitude" numeric(9,6)`);
    await queryRunner.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "locationNote" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "locationNote"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "longitude"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "latitude"`);
  }
}
