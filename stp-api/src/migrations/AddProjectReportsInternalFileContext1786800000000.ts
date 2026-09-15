import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El informe INTERNO de proyecto (nómina + márgenes) se archivaba en el mismo
 * contexto que el de CLIENTE (`project-reports`), así que cualquier miembro del
 * proyecto podía descargarlo vía `GET /files/:id/download` aunque el propio módulo
 * de informes exigiera MANAGER/ADMIN por cualquier otra vía. Contexto nuevo para
 * que esa descarga pueda diferenciarlos.
 */
export class AddProjectReportsInternalFileContext1786800000000 implements MigrationInterface {
  name = 'AddProjectReportsInternalFileContext1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "uploaded_files_context_enum" ADD VALUE IF NOT EXISTS 'project-reports-internal'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres no soporta quitar un valor de un enum sin recrear el tipo; no hace
    // falta revertirlo, solo deja de usarse.
  }
}
