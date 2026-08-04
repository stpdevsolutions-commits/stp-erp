import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PriceImport } from './price-import.entity';
import { Material } from './material.entity';
import { MaterialPrice, PriceCurrency } from './material-price.entity';

export enum PriceImportLineStatus {
  /** Recién extraída: nadie la ha mirado. */
  PENDING = 'pending',
  /** Aprobada: ya generó su fila en `material_prices` (`createdPriceId`). */
  APPROVED = 'approved',
  /** Descartada a mano (no era un material, precio absurdo, duplicado...). */
  REJECTED = 'rejected',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Una línea extraída del PDF: **un borrador de precio, no un precio**.
 *
 * Guarda lo que dijo el modelo tal cual (`raw*`) por separado de lo que decidió la
 * persona (`materialId`, `price`...). Si mañana hay que auditar un precio raro, se
 * puede ver si el error vino del PDF, del modelo o de la revisión.
 */
@Entity('price_import_lines')
export class PriceImportLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PriceImport, (imp) => imp.lines, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'importId' })
  import: PriceImport;

  @Index()
  @Column({ type: 'uuid' })
  importId: string;

  /** Orden en que aparecían en el documento; se respeta al mostrarlas. */
  @Column({ type: 'int', default: 0 })
  position: number;

  // ── Lo que leyó el modelo, sin tocar ────────────────────────────────────────

  /** Descripción tal como está en el PDF. Es lo que la persona compara. */
  @Column({ type: 'text' })
  rawDescription: string;

  /** Unidad tal como está en el PDF ("UD", "qq", "m2"...), sin mapear. */
  @Column({ type: 'varchar', nullable: true })
  rawUnit: string;

  /** Código o referencia del proveedor, si el PDF lo trae. */
  @Column({ type: 'varchar', nullable: true })
  rawCode: string;

  // ── Lo que se va a registrar ────────────────────────────────────────────────

  @Column({ type: 'numeric', precision: 14, scale: 4, transformer: dec })
  price: number;

  @Column({ type: 'enum', enum: PriceCurrency, default: PriceCurrency.DOP })
  currency: PriceCurrency;

  @Column({ type: 'boolean', default: false })
  itbisIncluded: boolean;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: dec })
  discountPct: number;

  /**
   * Material al que se imputa. Lo propone el emparejador por nombre y lo confirma o
   * corrige la persona; sin él la línea no se puede aprobar.
   */
  @ManyToOne(() => Material, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'uuid', nullable: true })
  materialId: string;

  /**
   * Cuántos materiales del catálogo encajaban con la descripción. 1 = candidato único
   * (se propone), >1 = ambiguo (no se propone ninguno), 0 = material nuevo.
   * Es un dato para ordenar la revisión, no una probabilidad.
   */
  @Column({ type: 'int', default: 0 })
  matchCount: number;

  @Column({ type: 'enum', enum: PriceImportLineStatus, default: PriceImportLineStatus.PENDING })
  status: PriceImportLineStatus;

  /** Precio generado al aprobar. Es el rastro de que esta línea ya entró. */
  @ManyToOne(() => MaterialPrice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdPriceId' })
  createdPrice: MaterialPrice;

  @Column({ type: 'uuid', nullable: true })
  createdPriceId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
