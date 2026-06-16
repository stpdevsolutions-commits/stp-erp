import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentContexts1750000000001 implements MigrationInterface {
  name = 'AddPaymentContexts1750000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."uploaded_files_context_enum" ADD VALUE IF NOT EXISTS 'client-payments'`);
    await queryRunner.query(`ALTER TYPE "public"."uploaded_files_context_enum" ADD VALUE IF NOT EXISTS 'project-payments'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
