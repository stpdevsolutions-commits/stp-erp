import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo rol `finanza` (ERP-84) — parte de la matriz de permisos por
 * rol x modulo definida en ERP-83. Postgres permite agregar un valor a un
 * enum dentro de una transaccion desde la version 12 (con la unica
 * restriccion de no poder USARLO en esa misma transaccion, que aqui no
 * hace falta). No hay forma limpia de revertir un valor de enum sin
 * tocar filas que ya lo usen, asi que `down` no lo intenta.
 */
export class AddFinanzaRole1790000000000 implements MigrationInterface {
  name = 'AddFinanzaRole1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'finanza'`,
    );
  }

  public async down(): Promise<void> {
    // No revertible sin migrar filas que ya usen 'finanza' a otro rol.
  }
}
