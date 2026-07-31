import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dos cambios que van juntos porque comparten la misma idea: el **colaborador**
 * (empleado sin cuenta de usuario) pasa a ser un actor de primera en el ERP.
 *
 * 1. `tasks.collaboratorId` — hasta ahora una tarea solo podía asignarse a un
 *    `user`, así que el personal de campo no aparecía en el selector de Tareas por
 *    mucho que se diera de alta en Colaboradores. Aditiva y nullable: las tareas
 *    existentes siguen igual.
 *
 * 2. `payroll_entries` — registro de los pagos a colaboradores. `grossAmount` y
 *    `netAmount` los calcula siempre el servidor; `expenseId` enlaza el gasto de
 *    mano de obra que se genera al marcar el pago como pagado (ON DELETE SET NULL
 *    como red de seguridad si el gasto se borra por fuera).
 *
 * El `collaboratorId` de la nómina es RESTRICT a propósito: borrar un colaborador
 * con pagos registrados destruiría el historial salarial en silencio.
 */
export class AddTaskCollaboratorAndPayroll1785200000000 implements MigrationInterface {
  name = 'AddTaskCollaboratorAndPayroll1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Tareas asignables a colaboradores ────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "collaboratorId" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "tasks" ADD CONSTRAINT "FK_tasks_collaborator"
          FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tasks_collaboratorId" ON "tasks" ("collaboratorId")`,
    );

    // ── 2. Nómina ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payroll_entries_status_enum" AS ENUM ('pending', 'paid', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payroll_entries_method_enum" AS ENUM ('cash', 'transfer', 'check', 'other');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "number" character varying NOT NULL,
        "collaboratorId" uuid NOT NULL,
        "projectId" uuid,
        "periodStart" date NOT NULL,
        "periodEnd" date NOT NULL,
        "daysWorked" numeric(6,2),
        "dailyRate" numeric(12,2),
        "overtimeAmount" numeric(12,2) NOT NULL DEFAULT 0,
        "bonuses" numeric(12,2) NOT NULL DEFAULT 0,
        "deductions" numeric(12,2) NOT NULL DEFAULT 0,
        "grossAmount" numeric(12,2) NOT NULL,
        "netAmount" numeric(12,2) NOT NULL,
        "status" "payroll_entries_status_enum" NOT NULL DEFAULT 'pending',
        "method" "payroll_entries_method_enum" NOT NULL DEFAULT 'cash',
        "paymentDate" date,
        "reference" character varying,
        "notes" text,
        "expenseId" uuid,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_entries_number" UNIQUE ("number")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "payroll_entries" ADD CONSTRAINT "FK_payroll_collaborator"
          FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "payroll_entries" ADD CONSTRAINT "FK_payroll_project"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "payroll_entries" ADD CONSTRAINT "FK_payroll_expense"
          FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "payroll_entries" ADD CONSTRAINT "FK_payroll_created_by"
          FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_collaboratorId" ON "payroll_entries" ("collaboratorId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_projectId" ON "payroll_entries" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_periodEnd" ON "payroll_entries" ("periodEnd")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payroll_entries_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payroll_entries_status_enum"`);

    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_tasks_collaborator"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tasks_collaboratorId"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN IF EXISTS "collaboratorId"`);
  }
}
