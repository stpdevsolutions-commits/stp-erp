import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reemplaza el campo libre `location` (texto sin estructura) por un estado
 * de ubicación estructurado: Almacén principal / En reparación / Prestado
 * (con `loanedToName`) / Asignado a proyecto (con `assignedProjectId`, FK a
 * `projects`). El módulo no tiene uso real todavía (1 fila de prueba), así
 * que se dropea `location` directamente sin migrar datos.
 */
export class AddInventoryLocationStatus1791000000000 implements MigrationInterface {
  name = 'AddInventoryLocationStatus1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "inventory_items_locationstatus_enum" AS ENUM ('warehouse', 'repair', 'loaned', 'assigned');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "locationStatus" "inventory_items_locationstatus_enum" NOT NULL DEFAULT 'warehouse'
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "loanedToName" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "assignedProjectId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD CONSTRAINT "FK_inventory_items_assignedProjectId"
        FOREIGN KEY ("assignedProjectId") REFERENCES "projects"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "location"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "location" character varying`);
    await queryRunner.query(`
      ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "FK_inventory_items_assignedProjectId"
    `);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "assignedProjectId"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "loanedToName"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "locationStatus"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_items_locationstatus_enum"`);
  }
}
