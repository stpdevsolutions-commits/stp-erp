import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RBAC granular por cliente y proyecto.
 *
 * Crea las dos tablas de pertenencia muchos-a-muchos:
 *  - project_members (projectId, userId)  ← qué usuarios trabajan en un proyecto
 *  - client_members  (clientId,  userId)  ← qué usuarios llevan un cliente entero
 *
 * `projects.assignedToId` se mantiene intacto y sigue funcionando como
 * pertenencia implícita (el responsable siempre ve su proyecto).
 *
 * BACKFILL — la migración es puramente aditiva y NO quita acceso a nadie que
 * hoy trabaje legítimamente con un dato. Se crea una asignación para cada
 * usuario que ya dejó huella en un proyecto o cliente:
 *   · responsable del proyecto (projects.assignedToId)
 *   · técnico de una ficha del proyecto (fichas.technicianId)
 *   · responsable de una tarea del proyecto (tasks.assignedToId)
 *   · quien registró un gasto del proyecto (expenses.createdById)
 *   · quien subió un archivo del proyecto / del cliente (uploaded_files.uploadedById)
 *   · quien registró un pago del proyecto / del cliente (payments.createdById)
 *   · quien creó el proyecto o la cotización (createdById)
 * ADMIN y MANAGER no necesitan asignaciones (acceso total por rol), pero el
 * backfill tampoco los excluye: si algún día se les degrada el rol conservan
 * el acceso a lo que ya trabajaban.
 */
export class AddProjectAndClientMembers1784900000000 implements MigrationInterface {
  name = 'AddProjectAndClientMembers1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tablas ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "projectId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_project_members_project_user" UNIQUE ("projectId", "userId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clientId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_client_members_client_user" UNIQUE ("clientId", "userId")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_members_projectId" ON "project_members" ("projectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_members_userId" ON "project_members" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_client_members_clientId" ON "client_members" ("clientId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_client_members_userId" ON "client_members" ("userId")`,
    );

    // ── Claves foráneas (idempotentes) ────────────────────────────────────
    const addFk = async (
      table: string,
      constraint: string,
      column: string,
      refTable: string,
      onDelete: string,
    ) => {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${constraint}'
          ) THEN
            ALTER TABLE "${table}"
              ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}")
              REFERENCES "${refTable}"("id") ON DELETE ${onDelete};
          END IF;
        END $$;
      `);
    };

    await addFk(
      'project_members',
      'FK_project_members_project',
      'projectId',
      'projects',
      'CASCADE',
    );
    await addFk(
      'project_members',
      'FK_project_members_user',
      'userId',
      'users',
      'CASCADE',
    );
    await addFk(
      'project_members',
      'FK_project_members_createdBy',
      'createdById',
      'users',
      'SET NULL',
    );
    await addFk(
      'client_members',
      'FK_client_members_client',
      'clientId',
      'clients',
      'CASCADE',
    );
    await addFk(
      'client_members',
      'FK_client_members_user',
      'userId',
      'users',
      'CASCADE',
    );
    await addFk(
      'client_members',
      'FK_client_members_createdBy',
      'createdById',
      'users',
      'SET NULL',
    );

    // ── Backfill de pertenencia a proyectos ───────────────────────────────
    const projectSources: string[] = [
      // Responsable y creador del proyecto
      `SELECT p."id" AS "projectId", p."assignedToId" AS "userId" FROM "projects" p WHERE p."assignedToId" IS NOT NULL`,
      `SELECT p."id" AS "projectId", p."createdById"  AS "userId" FROM "projects" p WHERE p."createdById"  IS NOT NULL`,
      // Técnicos con fichas en el proyecto
      `SELECT f."projectId", f."technicianId" AS "userId" FROM "fichas" f WHERE f."technicianId" IS NOT NULL`,
      // Tareas asignadas
      `SELECT t."projectId", t."assignedToId" AS "userId" FROM "tasks" t WHERE t."assignedToId" IS NOT NULL`,
      // Gastos registrados
      `SELECT e."projectId", e."createdById" AS "userId" FROM "expenses" e WHERE e."createdById" IS NOT NULL`,
      // Archivos subidos a un proyecto
      `SELECT uf."projectId", uf."uploadedById" AS "userId" FROM "uploaded_files" uf WHERE uf."projectId" IS NOT NULL AND uf."uploadedById" IS NOT NULL`,
      // Pagos registrados contra un proyecto
      `SELECT pay."projectId", pay."createdById" AS "userId" FROM "payments" pay WHERE pay."projectId" IS NOT NULL AND pay."createdById" IS NOT NULL`,
      // Cotizaciones ligadas a un proyecto
      `SELECT q."projectId", q."createdById" AS "userId" FROM "quotes" q WHERE q."projectId" IS NOT NULL AND q."createdById" IS NOT NULL`,
    ];

    await queryRunner.query(`
      INSERT INTO "project_members" ("projectId", "userId")
      SELECT DISTINCT src."projectId", src."userId"
      FROM (${projectSources.join(' UNION ALL ')}) src
      JOIN "projects" p ON p."id" = src."projectId"
      JOIN "users" u ON u."id" = src."userId"
      ON CONFLICT ("projectId", "userId") DO NOTHING
    `);

    // ── Backfill de pertenencia a clientes ────────────────────────────────
    const clientSources: string[] = [
      // Archivos a nivel de cliente (sin proyecto)
      `SELECT uf."clientId", uf."uploadedById" AS "userId" FROM "uploaded_files" uf WHERE uf."projectId" IS NULL AND uf."uploadedById" IS NOT NULL`,
      // Pagos a nivel de cliente (sin proyecto)
      `SELECT pay."clientId", pay."createdById" AS "userId" FROM "payments" pay WHERE pay."projectId" IS NULL AND pay."createdById" IS NOT NULL`,
      // Cotizaciones a nivel de cliente (sin proyecto)
      `SELECT q."clientId", q."createdById" AS "userId" FROM "quotes" q WHERE q."projectId" IS NULL AND q."createdById" IS NOT NULL`,
    ];

    await queryRunner.query(`
      INSERT INTO "client_members" ("clientId", "userId")
      SELECT DISTINCT src."clientId", src."userId"
      FROM (${clientSources.join(' UNION ALL ')}) src
      JOIN "clients" c ON c."id" = src."clientId"
      JOIN "users" u ON u."id" = src."userId"
      ON CONFLICT ("clientId", "userId") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "client_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_members"`);
  }
}
