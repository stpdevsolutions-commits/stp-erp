import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade el contexto `project-reports` a `uploaded_files_context_enum`, para poder
 * archivar el PDF de un informe como archivo del proyecto (botón "Guardar en el
 * proyecto") en vez de solo descargarlo.
 *
 * Va en su propio contexto y no en `project-documents` porque son cosas
 * distintas: `project-documents` es lo que una persona sube, esto lo genera el
 * ERP. Tenerlos separados es lo que permite que el sync a Nextcloud les dé una
 * carpeta propia ("ERP/Informes") y que un informe viejo no se confunda con un
 * plano o un contrato.
 *
 * Puramente aditiva: añade un valor al enum, no toca filas ni columnas
 * existentes. `ADD VALUE IF NOT EXISTS` la hace idempotente.
 *
 * ⚠️ El `down` NO revierte. Postgres no sabe quitar un valor de un enum sin
 * recrear el tipo y reescribir la columna, y hacerlo con filas que ya usan el
 * valor destruiría datos. Un valor de enum de más es inerte; borrar informes
 * archivados no lo es.
 */
export class AddProjectReportsFileContext1785800000000 implements MigrationInterface {
  name = 'AddProjectReportsFileContext1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "uploaded_files_context_enum" ADD VALUE IF NOT EXISTS 'project-reports'
    `);
  }

  public async down(): Promise<void> {
    // Intencionadamente vacío: ver la nota de arriba.
  }
}
