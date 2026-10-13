import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-62: `expenses.projectId` era ON DELETE CASCADE, así que borrar un proyecto se llevaba
 * en cascada sus gastos (incluida la mano de obra de nómina). Pasa a RESTRICT: la base de
 * datos rechaza el borrado si quedan gastos, como segunda barrera tras el 409 que ya da
 * `ProjectsService.remove`. Solo se toca esta FK; las de tareas, informes y cálculos de
 * materiales siguen en CASCADE a propósito (son del proyecto, no dinero).
 *
 * El nombre de la constraint viene de InitialSchema y se comprobó en producción
 * (pg_constraint). Si no existiera, `DROP CONSTRAINT IF EXISTS` no falla y la nueva se crea igual.
 */
export class RestrictProjectCascades1797650000000 implements MigrationInterface {
  name = 'RestrictProjectCascades1797650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_be2b82c1909df01271e1029cca0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_be2b82c1909df01271e1029cca0" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_be2b82c1909df01271e1029cca0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_be2b82c1909df01271e1029cca0" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
