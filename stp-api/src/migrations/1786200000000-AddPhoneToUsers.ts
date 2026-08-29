import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Teléfono del usuario para notificaciones por WhatsApp (asignación de tareas).
 * Aditiva y nullable: los usuarios existentes quedan sin teléfono hasta que
 * ellos mismos (o un admin) lo completen en su perfil.
 */
export class AddPhoneToUsers1786200000000 implements MigrationInterface {
  name = 'AddPhoneToUsers1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "phone" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"
    `);
  }
}
