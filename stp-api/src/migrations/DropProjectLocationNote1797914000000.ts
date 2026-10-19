import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ERP-80 (seguimiento): se unifica la ubicación en texto en `projects.location`
 * (la columna que ya existía); `locationNote` sobraba. Antes de borrarla se copia
 * a `location` cuando esta está vacía, para no perder datos (hoy hay 0 filas).
 * Se usa IF EXISTS para que sea re-ejecutable.
 */
export class DropProjectLocationNote1797914000000 implements MigrationInterface {
  name = 'DropProjectLocationNote1797914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const col = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'locationNote'`,
    );
    if (col.length > 0) {
      await queryRunner.query(
        `UPDATE "projects" SET "location" = LEFT(TRIM("locationNote"), 255)
         WHERE ("location" IS NULL OR TRIM("location") = '')
           AND "locationNote" IS NOT NULL AND TRIM("locationNote") <> ''`,
      );
    }
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "locationNote"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "locationNote" text`);
  }
}
