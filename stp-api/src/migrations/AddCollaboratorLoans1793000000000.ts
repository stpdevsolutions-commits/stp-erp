import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-91: préstamos a colaboradores con descuento automático en nómina.
 * Nueva tabla `collaborator_loans` + columnas `loanId`/`loanDeductionAmount`
 * en `payroll_entries` para trazar de qué préstamo (y cuánto) se descontó
 * cada pago, y poder revertirlo si el pago se borra.
 */
export class AddCollaboratorLoans1793000000000 implements MigrationInterface {
  name = 'AddCollaboratorLoans1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "collaborator_loans_status_enum" AS ENUM ('active', 'paid', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "collaborator_loans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "collaboratorId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "balance" numeric(12,2) NOT NULL,
        "installmentAmount" numeric(12,2) NOT NULL,
        "status" "collaborator_loans_status_enum" NOT NULL DEFAULT 'active',
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_collaborator_loans_collaboratorId" FOREIGN KEY ("collaboratorId")
          REFERENCES "collaborators"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "loanId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_entries" ADD COLUMN IF NOT EXISTS "loanDeductionAmount" numeric(12,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_entries"
        ADD CONSTRAINT "FK_payroll_entries_loanId"
        FOREIGN KEY ("loanId") REFERENCES "collaborator_loans"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payroll_entries" DROP CONSTRAINT IF EXISTS "FK_payroll_entries_loanId"`);
    await queryRunner.query(`ALTER TABLE "payroll_entries" DROP COLUMN IF EXISTS "loanDeductionAmount"`);
    await queryRunner.query(`ALTER TABLE "payroll_entries" DROP COLUMN IF EXISTS "loanId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "collaborator_loans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "collaborator_loans_status_enum"`);
  }
}
