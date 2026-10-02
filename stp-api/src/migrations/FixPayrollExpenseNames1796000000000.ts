import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los gastos de mano de obra generados desde Nómina se guardaban como
 * "Mano de obra — colaborador (…)" porque la entidad recién guardada no traía
 * cargado el colaborador (corregido en PayrollService.syncExpense). Esto
 * reescribe la descripción de los gastos ya creados con el nombre real,
 * tocando solo los que siguen enlazados a un pago de nómina y conservan el
 * texto genérico (un gasto editado a mano no se toca).
 */
export class FixPayrollExpenseNames1796000000000 implements MigrationInterface {
  name = 'FixPayrollExpenseNames1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "expenses" e
      SET "description" =
        'Mano de obra — ' || trim(c."firstName" || ' ' || c."lastName") ||
        ' (' || p."periodStart" || ' a ' || p."periodEnd" || ')'
      FROM "payroll_entries" p
      JOIN "collaborators" c ON c."id" = p."collaboratorId"
      WHERE p."expenseId" = e."id"
        AND e."description" LIKE 'Mano de obra — colaborador (%'
    `);
  }

  public async down(): Promise<void> {
    // Sin vuelta atrás: el texto genérico no aportaba información.
  }
}
