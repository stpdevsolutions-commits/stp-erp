import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo tipo de ficha "domotica": lo que antes vivía mezclado dentro de
 * "levantamiento" (conectividad, panel eléctrico para switches inteligentes,
 * ambientes con dispositivos domóticos, cotización de equipos) pasa a ser su
 * propio tipo de ficha, separado del levantamiento general (cajitas,
 * tomacorrientes, interruptores, luminarias, materiales del catálogo).
 */
export class AddDomoticaFichaType1786100000000 implements MigrationInterface {
  name = 'AddDomoticaFichaType1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."fichas_type_enum" ADD VALUE IF NOT EXISTS 'domotica'
    `);
  }

  public async down(): Promise<void> {
    // Postgres no soporta quitar un valor de un enum directamente (haría falta
    // recrear el tipo y todas sus dependencias). No reversible en la práctica;
    // si alguna vez hace falta revertir, se recrea el tipo a mano.
  }
}
