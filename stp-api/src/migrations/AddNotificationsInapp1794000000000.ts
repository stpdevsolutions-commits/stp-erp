import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-107: feed de notificaciones in-app (campanita del header). Puramente
 * aditiva: una tabla y un enum nuevos, nada existente se toca.
 */
export class AddNotificationsInapp1794000000000 implements MigrationInterface {
  name = 'AddNotificationsInapp1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notifications_inapp_type_enum" AS ENUM ('task_assigned', 'quote_approved', 'quote_rejected', 'payment_received');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications_inapp" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" "notifications_inapp_type_enum" NOT NULL,
        "title" character varying NOT NULL,
        "message" text,
        "link" character varying,
        "read" boolean NOT NULL DEFAULT false,
        "readAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notifications_inapp_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_inapp_userId" ON "notifications_inapp" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications_inapp"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_inapp_type_enum"`);
  }
}
