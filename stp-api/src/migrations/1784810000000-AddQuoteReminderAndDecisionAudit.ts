import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recordatorios automáticos de cotizaciones sin respuesta + auditoría de la
 * decisión del cliente (quién/cuándo/IP desde el enlace del correo):
 *  - quotes.sentAt             timestamptz NULL  (última transición a SENT)
 *  - quotes.reminderCount      int NOT NULL DEFAULT 0
 *  - quotes.lastReminderAt     timestamptz NULL
 *  - quotes.decidedAt          timestamptz NULL
 *  - quotes.decisionIp         varchar NULL
 *  - quotes.decisionUserAgent  text NULL
 *
 * Backfill: las cotizaciones ya en estado 'sent' toman updatedAt como sentAt
 * para que entren al ciclo de recordatorios.
 */
export class AddQuoteReminderAndDecisionAudit1784810000000 implements MigrationInterface {
  name = 'AddQuoteReminderAndDecisionAudit1784810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "reminderCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "decisionIp" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "decisionUserAgent" text`,
    );
    await queryRunner.query(
      `UPDATE "quotes" SET "sentAt" = "updatedAt" WHERE "status" = 'sent' AND "sentAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "decisionUserAgent"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "decisionIp"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "decidedAt"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "lastReminderAt"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "reminderCount"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN IF EXISTS "sentAt"`);
  }
}
