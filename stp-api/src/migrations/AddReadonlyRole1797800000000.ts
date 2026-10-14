import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INF-15: nuevo rol `readonly` — cuenta de agente (Hermes/MCP) de SOLO LECTURA que ve
 * Clientes y Cotizaciones y nada más (matriz en common/access/module-permissions.ts).
 *
 * `users.role` es un enum de Postgres (`users_role_enum`, creado por InitialSchema y ampliado
 * con 'finanza' en AddFinanzaRole). Postgres >= 12 permite ADD VALUE dentro de una transacción
 * siempre que el valor nuevo no se USE en esa misma transacción (aquí no se usa), igual que la
 * migración de 'finanza' que ya corrió en producción; por eso no hace falta `transaction = false`.
 *
 * Esta migración SOLO agrega el valor; asignarlo a un usuario es un UPDATE manual aparte.
 * `down` no es reversible: Postgres no puede quitar un valor de un enum sin recrear el tipo
 * y migrar las filas que lo usen.
 */
export class AddReadonlyRole1797800000000 implements MigrationInterface {
  name = 'AddReadonlyRole1797800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'readonly'`,
    );
  }

  public async down(): Promise<void> {
    // No revertible sin recrear el enum y migrar antes los usuarios con rol 'readonly'.
  }
}
