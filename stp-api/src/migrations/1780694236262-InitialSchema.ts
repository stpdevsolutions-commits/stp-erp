import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1780694236262 implements MigrationInterface {
  name = 'InitialSchema1780694236262';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'manager', 'user')`);
    await queryRunner.query(`CREATE TYPE "public"."clients_type_enum" AS ENUM('company', 'individual')`);
    await queryRunner.query(`CREATE TYPE "public"."projects_status_enum" AS ENUM('draft', 'active', 'on_hold', 'completed', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "public"."projects_type_enum" AS ENUM('electrical', 'mechanical', 'construction', 'maintenance', 'other')`);
    await queryRunner.query(`CREATE TYPE "public"."tasks_status_enum" AS ENUM('pending', 'in_progress', 'review', 'done', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "public"."tasks_priority_enum" AS ENUM('low', 'medium', 'high', 'urgent')`);
    await queryRunner.query(`CREATE TYPE "public"."quotes_status_enum" AS ENUM('draft', 'sent', 'approved', 'rejected', 'expired')`);
    await queryRunner.query(`CREATE TYPE "public"."suppliers_category_enum" AS ENUM('materials', 'equipment', 'services', 'subcontract', 'other')`);
    await queryRunner.query(`CREATE TYPE "public"."expenses_category_enum" AS ENUM('materials', 'labor', 'equipment', 'subcontract', 'travel', 'other')`);
    await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('cash', 'transfer', 'check', 'card', 'other')`);
    await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'completed', 'failed', 'refunded')`);
    await queryRunner.query(`CREATE TYPE "public"."collaborators_status_enum" AS ENUM('active', 'inactive')`);
    await queryRunner.query(`CREATE TYPE "public"."fichas_type_enum" AS ENUM('electrico', 'civil', 'electromecanico', 'levantamiento', 'evaluacion_danos')`);
    await queryRunner.query(`CREATE TYPE "public"."fichas_status_enum" AS ENUM('borrador', 'en_progreso', 'enviada')`);
    await queryRunner.query(`CREATE TYPE "public"."inventory_items_category_enum" AS ENUM('materials', 'equipment', 'tools', 'electrical', 'mechanical', 'consumables', 'other')`);
    await queryRunner.query(`CREATE TYPE "public"."uploaded_files_context_enum" AS ENUM('client-profile', 'client-quotes', 'client-payments', 'client-documents', 'project-photos', 'project-documents', 'project-expenses', 'project-quotes', 'project-payments')`);

    // ── Independent tables ───────────────────────────────────────────────────
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password" character varying NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "type" "public"."clients_type_enum" NOT NULL DEFAULT 'company', "rnc" character varying, "email" character varying, "phone" character varying, "address" character varying, "city" character varying, "contactName" character varying, "contactPhone" character varying, "notes" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c4d635127962ae35bd4d7631031" UNIQUE ("rnc"), CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "rnc" character varying, "category" "public"."suppliers_category_enum" NOT NULL DEFAULT 'other', "email" character varying, "phone" character varying, "address" character varying, "city" character varying, "contactName" character varying, "contactPhone" character varying, "notes" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7a2c7a051e41493abef1148cc1a" UNIQUE ("rnc"), CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "collaborators" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying, "phone" character varying, "position" character varying, "cedula" character varying, "dailyRate" numeric(12,2), "status" "public"."collaborators_status_enum" NOT NULL DEFAULT 'active', "notes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f579a5df9d66287f400806ad875" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "inventory_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "sku" character varying, "category" "public"."inventory_items_category_enum" NOT NULL DEFAULT 'other', "description" text, "quantity" numeric(12,2) NOT NULL DEFAULT '0', "unit" character varying, "cost" numeric(12,2) NOT NULL DEFAULT '0', "price" numeric(12,2) NOT NULL DEFAULT '0', "location" character varying, "minStock" numeric(12,2), "notes" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cf2f451407242e132547ac19169" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "app_settings" ("key" character varying NOT NULL, "value" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_975c2db59c65c05fd9c6b63a2ab" PRIMARY KEY ("key"))`);

    // ── Tables with FK deps ──────────────────────────────────────────────────
    await queryRunner.query(`CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "status" "public"."projects_status_enum" NOT NULL DEFAULT 'draft', "type" "public"."projects_type_enum" NOT NULL DEFAULT 'other', "clientId" uuid NOT NULL, "assignedToId" uuid, "createdById" uuid, "startDate" date, "endDate" date, "completedAt" date, "budget" numeric(12,2), "location" character varying, "notes" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d95a87318392465ab663a32cc4f" UNIQUE ("code"), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text, "status" "public"."tasks_status_enum" NOT NULL DEFAULT 'pending', "priority" "public"."tasks_priority_enum" NOT NULL DEFAULT 'medium', "projectId" uuid NOT NULL, "assignedToId" uuid, "createdById" uuid, "dueDate" date, "completedAt" date, "estimatedHours" numeric(6,2), "actualHours" numeric(6,2), "notes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "quotes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" character varying NOT NULL, "title" character varying NOT NULL, "status" "public"."quotes_status_enum" NOT NULL DEFAULT 'draft', "clientId" uuid NOT NULL, "projectId" uuid, "createdById" uuid, "validUntil" date, "taxRate" numeric(5,2) NOT NULL DEFAULT '18', "discount" numeric(12,2) NOT NULL DEFAULT '0', "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "taxAmount" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "notes" text, "terms" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_15ae60730d4562df625600005b2" UNIQUE ("number"), CONSTRAINT "PK_99a0e8bcbcd8719d3a41f23c263" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "quote_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quoteId" uuid NOT NULL, "description" character varying NOT NULL, "quantity" numeric(10,2) NOT NULL, "unit" character varying, "unitPrice" numeric(12,2) NOT NULL, "total" numeric(12,2) NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_135ad3f02b5abcf65fb5cb20ad2" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "projectId" uuid NOT NULL, "description" character varying NOT NULL, "category" "public"."expenses_category_enum" NOT NULL DEFAULT 'other', "amount" numeric(12,2) NOT NULL, "date" date NOT NULL, "supplierId" uuid, "notes" text, "createdById" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "projectId" uuid, "quoteId" uuid, "description" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "method" "public"."payments_method_enum" NOT NULL DEFAULT 'transfer', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'completed', "date" date NOT NULL, "reference" character varying, "notes" text, "createdById" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character varying(64) NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "uploaded_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "originalName" character varying NOT NULL, "filename" character varying NOT NULL, "path" character varying NOT NULL, "mimetype" character varying NOT NULL, "size" integer NOT NULL, "context" "public"."uploaded_files_context_enum" NOT NULL, "clientId" uuid NOT NULL, "projectId" uuid, "uploadedById" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e2d47e01bd5be386bf0067b2ed8" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "fichas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "type" "public"."fichas_type_enum" NOT NULL, "status" "public"."fichas_status_enum" NOT NULL DEFAULT 'borrador', "projectId" uuid NOT NULL, "technicianId" uuid NOT NULL, "data" jsonb NOT NULL DEFAULT '{}', "latitude" numeric(10,7), "longitude" numeric(10,7), "photos" text, "signature" text, "submittedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ac58201ee6b8a920ef39e1fff27" UNIQUE ("code"), CONSTRAINT "PK_25bf956e31efb0e2ae8515325b6" PRIMARY KEY ("id"))`);

    // ── Foreign keys ─────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_091f9433895a53408cb8ae3864f" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_ef67403447cd537f77cf82b4eda" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_f55144dc92df43cd1dad5d29b90" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_d020677feafe94eba0cb9d846d1" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_660898d912c6e71107e9ef8f38d" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotes" ADD CONSTRAINT "FK_7967e388c4d8bb7b345cf2b8a2f" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotes" ADD CONSTRAINT "FK_dbebc7fcdeb052318c99d2c23a6" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quotes" ADD CONSTRAINT "FK_3c3c38f2fc5c43fb8e8440ca012" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "quote_items" ADD CONSTRAINT "FK_ef162674660b3ed9dc76de21160" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_be2b82c1909df01271e1029cca0" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_cb04770a68c157a22fa42cc0506" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_4f3e45915b1db0536a90400b419" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_e7c2e95ccd4bd2068c70744dd65" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_497370a7f747f66f524ab3c548d" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_cfa912e8f5432da7ad4b481718e" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_8b8ddc119cf77e4a8968f47a703" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "uploaded_files" ADD CONSTRAINT "FK_186129103051fba7f7a859a0761" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "fichas" ADD CONSTRAINT "FK_c68cbd6b6f2487d0b1f5c0b3637" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "fichas" ADD CONSTRAINT "FK_04d4c5e5d5b8f4834164d316f85" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fichas" DROP CONSTRAINT "FK_04d4c5e5d5b8f4834164d316f85"`);
    await queryRunner.query(`ALTER TABLE "fichas" DROP CONSTRAINT "FK_c68cbd6b6f2487d0b1f5c0b3637"`);
    await queryRunner.query(`ALTER TABLE "uploaded_files" DROP CONSTRAINT "FK_186129103051fba7f7a859a0761"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_8b8ddc119cf77e4a8968f47a703"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_cfa912e8f5432da7ad4b481718e"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_497370a7f747f66f524ab3c548d"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_e7c2e95ccd4bd2068c70744dd65"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_4f3e45915b1db0536a90400b419"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_cb04770a68c157a22fa42cc0506"`);
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_be2b82c1909df01271e1029cca0"`);
    await queryRunner.query(`ALTER TABLE "quote_items" DROP CONSTRAINT "FK_ef162674660b3ed9dc76de21160"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_3c3c38f2fc5c43fb8e8440ca012"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_dbebc7fcdeb052318c99d2c23a6"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_7967e388c4d8bb7b345cf2b8a2f"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_660898d912c6e71107e9ef8f38d"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_d020677feafe94eba0cb9d846d1"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_f55144dc92df43cd1dad5d29b90"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_ef67403447cd537f77cf82b4eda"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_091f9433895a53408cb8ae3864f"`);
    await queryRunner.query(`DROP TABLE "fichas"`);
    await queryRunner.query(`DROP TABLE "uploaded_files"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TABLE "quote_items"`);
    await queryRunner.query(`DROP TABLE "quotes"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP TABLE "inventory_items"`);
    await queryRunner.query(`DROP TABLE "collaborators"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."uploaded_files_context_enum"`);
    await queryRunner.query(`DROP TYPE "public"."inventory_items_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."fichas_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."fichas_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."collaborators_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
    await queryRunner.query(`DROP TYPE "public"."expenses_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."suppliers_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."quotes_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."projects_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."projects_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."clients_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
