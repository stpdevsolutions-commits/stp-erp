import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `tokenHash` no tenía índice pese a ser la columna por la que se busca en CADA
 * refresco de sesión (`AuthService.refresh`/`logout`) — un escaneo completo de la
 * tabla en el camino más caliente de auth. Único porque es un hash de 40 bytes
 * aleatorios: la colisión es prácticamente imposible.
 */
export class AddRefreshTokenHashIndex1786900000000 implements MigrationInterface {
  name = 'AddRefreshTokenHashIndex1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_tokenHash"`);
  }
}
