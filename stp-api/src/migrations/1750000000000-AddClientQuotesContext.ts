import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientQuotesContext1750000000000 implements MigrationInterface {
  name = 'AddClientQuotesContext1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."uploaded_files_context_enum" ADD VALUE IF NOT EXISTS 'client-quotes'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values — no-op
  }
}
