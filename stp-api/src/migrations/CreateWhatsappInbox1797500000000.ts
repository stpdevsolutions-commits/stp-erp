import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bandeja de WhatsApp y CRM ligero (ERP-57): contactos/leads con su etapa del pipeline y todos los
 * mensajes (entrantes y salientes). Hasta ahora los mensajes solo vivían en los logs de Docker.
 */
export class CreateWhatsappInbox1797500000000 implements MigrationInterface {
  name = 'CreateWhatsappInbox1797500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "wa_contacts_stage_enum" AS ENUM ('new', 'qualifying', 'visit_pending', 'visit_done', 'quote_sent', 'won', 'lost')`,
    );
    await queryRunner.query(`
      CREATE TABLE "wa_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying NOT NULL,
        "name" character varying,
        "clientId" uuid,
        "stage" "wa_contacts_stage_enum" NOT NULL DEFAULT 'new',
        "service" character varying,
        "notes" text,
        "assignedToId" uuid,
        "lastInboundAt" TIMESTAMP WITH TIME ZONE,
        "lastMessageAt" TIMESTAMP WITH TIME ZONE,
        "lastMessagePreview" character varying,
        "unreadCount" integer NOT NULL DEFAULT 0,
        "awaitingReply" boolean NOT NULL DEFAULT false,
        "lastAlertAt" TIMESTAMP WITH TIME ZONE,
        "escalatedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wa_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wa_contacts_phone" UNIQUE ("phone"),
        CONSTRAINT "FK_wa_contacts_client" FOREIGN KEY ("clientId")
          REFERENCES "clients"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_wa_contacts_assignedTo" FOREIGN KEY ("assignedToId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wa_contacts_lastMessageAt" ON "wa_contacts" ("lastMessageAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_wa_contacts_assignedToId" ON "wa_contacts" ("assignedToId")`);
    await queryRunner.query(`CREATE INDEX "IDX_wa_contacts_clientId" ON "wa_contacts" ("clientId")`);

    await queryRunner.query(`CREATE TYPE "wa_messages_direction_enum" AS ENUM ('in', 'out')`);
    await queryRunner.query(`
      CREATE TABLE "wa_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contactId" uuid NOT NULL,
        "waId" character varying,
        "direction" "wa_messages_direction_enum" NOT NULL,
        "type" character varying NOT NULL DEFAULT 'text',
        "body" text,
        "mediaId" character varying,
        "mediaPath" character varying,
        "mime" character varying,
        "filename" character varying,
        "status" character varying NOT NULL DEFAULT 'received',
        "error" text,
        "templateName" character varying,
        "sentById" uuid,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wa_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wa_messages_waId" UNIQUE ("waId"),
        CONSTRAINT "FK_wa_messages_contact" FOREIGN KEY ("contactId")
          REFERENCES "wa_contacts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wa_messages_sentBy" FOREIGN KEY ("sentById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wa_messages_contact_sentAt" ON "wa_messages" ("contactId", "sentAt")`);

    await queryRunner.query(
      `ALTER TYPE "notifications_inapp_type_enum" ADD VALUE IF NOT EXISTS 'message_received'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wa_messages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wa_messages_direction_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wa_contacts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wa_contacts_stage_enum"`);
    // El valor 'message_received' del enum de notificaciones no se puede quitar de un enum de Postgres.
  }
}
