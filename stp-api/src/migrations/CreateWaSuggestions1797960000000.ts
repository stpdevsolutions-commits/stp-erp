import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sugerencias del copiloto de WhatsApp (ERP-56, fase 2): una fila por mensaje analizado. */
export class CreateWaSuggestions1797960000000 implements MigrationInterface {
  name = 'CreateWaSuggestions1797960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wa_suggestions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contactId" uuid NOT NULL,
        "triggerMessageId" uuid,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "kind" character varying(20) NOT NULL DEFAULT 'ninguna',
        "category" character varying(40),
        "summary" text,
        "service" character varying(40),
        "lead" jsonb NOT NULL DEFAULT '{}',
        "missing" jsonb NOT NULL DEFAULT '[]',
        "escalate" boolean NOT NULL DEFAULT false,
        "escalationReasons" jsonb NOT NULL DEFAULT '[]',
        "reply" text,
        "confidence" real NOT NULL DEFAULT 0,
        "flags" jsonb NOT NULL DEFAULT '[]',
        "provider" character varying(20),
        "model" character varying(80),
        "error" text,
        "edited" boolean NOT NULL DEFAULT false,
        "resolvedById" uuid,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "sentMessageId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wa_suggestions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wa_suggestions_triggerMessageId" UNIQUE ("triggerMessageId"),
        CONSTRAINT "FK_wa_suggestions_contact" FOREIGN KEY ("contactId")
          REFERENCES "wa_contacts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_wa_suggestions_contact_createdAt" ON "wa_suggestions" ("contactId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "wa_suggestions"`);
  }
}
