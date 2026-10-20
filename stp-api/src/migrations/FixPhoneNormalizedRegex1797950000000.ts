import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-75: corrige la expresion de las columnas `phoneNormalized`. La migracion original escribia '\D'
 * dentro de una plantilla de TypeScript, donde ese escape se pierde y el regex quedaba como 'D':
 * la columna conservaba guiones y espacios y nunca coincidia con el numero de WhatsApp (solo digitos).
 * Postgres 15 no permite cambiar la expresion de una columna generada, asi que se recrean (y se rellenan solas).
 */
const norm = (col: string) => {
  const d = `regexp_replace("${col}", '\\D', '', 'g')`;
  return `CASE WHEN length(${d}) = 10 THEN '1' || ${d} WHEN length(${d}) BETWEEN 11 AND 15 THEN ${d} ELSE NULL END`;
};

export class FixPhoneNormalizedRegex1797950000000 implements MigrationInterface {
  name = 'FixPhoneNormalizedRegex1797950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_contactPhoneNormalized"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_phoneNormalized"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_phoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN IF EXISTS "contactPhoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN IF EXISTS "phoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phoneNormalized"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "phoneNormalized" character varying GENERATED ALWAYS AS (${norm('phone')}) STORED`);
    await queryRunner.query(`ALTER TABLE "clients" ADD "phoneNormalized" character varying GENERATED ALWAYS AS (${norm('phone')}) STORED`);
    await queryRunner.query(`ALTER TABLE "clients" ADD "contactPhoneNormalized" character varying GENERATED ALWAYS AS (${norm('contactPhone')}) STORED`);
    await queryRunner.query(`CREATE INDEX "IDX_users_phoneNormalized" ON "users" ("phoneNormalized")`);
    await queryRunner.query(`CREATE INDEX "IDX_clients_phoneNormalized" ON "clients" ("phoneNormalized")`);
    await queryRunner.query(`CREATE INDEX "IDX_clients_contactPhoneNormalized" ON "clients" ("contactPhoneNormalized")`);
  }

  public async down(): Promise<void> {
    // Sin reversa: volver a la expresion defectuosa no tiene sentido. La migracion anterior sigue siendo valida.
  }
}
