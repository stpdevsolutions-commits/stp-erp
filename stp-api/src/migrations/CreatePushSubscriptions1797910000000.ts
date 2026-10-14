import { MigrationInterface, QueryRunner } from 'typeorm';

/** Suscripciones Web Push de la PWA (ERP-58): una fila por dispositivo, con su endpoint único. */
export class CreatePushSubscriptions1797910000000 implements MigrationInterface {
  name = 'CreatePushSubscriptions1797910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "endpoint" text NOT NULL,
        "p256dh" character varying(255) NOT NULL,
        "auth" character varying(255) NOT NULL,
        "userAgent" character varying(300),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastUsedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "FK_push_subscriptions_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_push_subscriptions_userId" ON "push_subscriptions" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "push_subscriptions"`);
  }
}
