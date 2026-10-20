import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-75: teléfono normalizado e indexado para `isStaff` / `findClientId` (bandeja de WhatsApp).
 * Columnas generadas y guardadas: Postgres las calcula (y rellena las filas existentes al crear la columna)
 * con la misma regla que `normalizePhone`: solo dígitos; 10 dígitos => se antepone "1"; 11 a 15 se dejan; otro => NULL.
 */
const norm = (col: string) => {
  const d = `regexp_replace("${col}", '\\D', '', 'g')`;
  return `CASE WHEN length(${d}) = 10 THEN '1' || ${d} WHEN length(${d}) BETWEEN 11 AND 15 THEN ${d} ELSE NULL END`;
};

export class AddPhoneNormalized1797700000000 implements MigrationInterface {
  name = 'AddPhoneNormalized1797700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "phoneNormalized" character varying GENERATED ALWAYS AS (${norm('phone')}) STORED`);
    await queryRunner.query(`ALTER TABLE "clients" ADD "phoneNormalized" character varying GENERATED ALWAYS AS (${norm('phone')}) STORED`);
    await queryRunner.query(`ALTER TABLE "clients" ADD "contactPhoneNormalized" character varying GENERATED ALWAYS AS (${norm('contactPhone')}) STORED`);
    await queryRunner.query(`CREATE INDEX "IDX_users_phoneNormalized" ON "users" ("phoneNormalized")`);
    await queryRunner.query(`CREATE INDEX "IDX_clients_phoneNormalized" ON "clients" ("phoneNormalized")`);
    await queryRunner.query(`CREATE INDEX "IDX_clients_contactPhoneNormalized" ON "clients" ("contactPhoneNormalized")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_clients_contactPhoneNormalized"`);
    await queryRunner.query(`DROP INDEX "IDX_clients_phoneNormalized"`);
    await queryRunner.query(`DROP INDEX "IDX_users_phoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "contactPhoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "phoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phoneNormalized"`);
  }
}
