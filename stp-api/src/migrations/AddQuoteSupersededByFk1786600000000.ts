import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `supersededById` apuntaba a otra cotización sin FK real: borrar la revisión
 * vigente dejaba a la anterior con una referencia colgando (404 al intentar
 * resolverla). ON DELETE SET NULL porque un documento histórico no debe
 * desaparecer ni bloquear el borrado de la revisión que lo reemplazó — solo
 * pierde el enlace hacia adelante.
 */
export class AddQuoteSupersededByFk1786600000000 implements MigrationInterface {
  name = 'AddQuoteSupersededByFk1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "FK_quotes_supersededById" FOREIGN KEY ("supersededById") REFERENCES "quotes"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_quotes_supersededById"`);
  }
}
