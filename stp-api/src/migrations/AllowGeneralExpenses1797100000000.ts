import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-34: gastos generales. Un gasto puede no tener proyecto (oficina, vehículo,
 * servicios de la empresa). La FK sigue siendo ON DELETE CASCADE para los que sí
 * tienen. El `down` solo es seguro mientras no exista ningún gasto general: si los
 * hay, falla en vez de borrarlos.
 */
export class AllowGeneralExpenses1797100000000 implements MigrationInterface {
  name = 'AllowGeneralExpenses1797100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "projectId" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "projectId" SET NOT NULL`);
  }
}
