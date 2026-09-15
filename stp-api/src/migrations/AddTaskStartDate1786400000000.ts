import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha de inicio de una tarea, para poder dibujarla como un rango (no un
 * punto) en la vista semanal de Cronograma. Antes solo existía `dueDate`.
 * Aditiva y nullable: las tareas existentes se quedan sin barra de inicio
 * hasta que se les asigne una.
 */
export class AddTaskStartDate1786400000000 implements MigrationInterface {
  name = 'AddTaskStartDate1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "startDate" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN IF EXISTS "startDate"`);
  }
}
