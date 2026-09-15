import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supervisor de campo de un proyecto: colaborador (personal sin cuenta de
 * usuario, tabla `collaborators`) distinto del "encargado" (`assignedToId`,
 * un usuario del sistema). Aditiva y nullable.
 */
export class AddProjectSupervisor1786300000000 implements MigrationInterface {
  name = 'AddProjectSupervisor1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "supervisorId" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "projects" ADD CONSTRAINT "FK_projects_supervisor"
        FOREIGN KEY ("supervisorId") REFERENCES "collaborators"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_projects_supervisorId" ON "projects" ("supervisorId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_supervisorId"`);
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "FK_projects_supervisor"`,
    );
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "supervisorId"`);
  }
}
