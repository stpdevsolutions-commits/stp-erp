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
import { Material } from './material.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { User } from '../../users/entities/user.entity';

export enum PriceCurrency {
  DOP = 'DOP',
  USD = 'USD',
}

/** Regiones con mercado propio: el transporte y la disponibilidad cambian el precio. */
export enum PriceRegion {
  SANTO_DOMINGO = 'santo_domingo',
  SANTIAGO_CIBAO = 'santiago_cibao',
  ESTE_PUNTA_CANA = 'este_punta_cana',
  NORTE = 'norte',
  SUR = 'sur',
  OTRA = 'otra',
}

export enum PriceSource {
  /** Registrado a mano por un usuario. */
  MANUAL = 'manual',
  /** Extraído de una cotización de proveedor (PDF/imagen/Excel). */
  SUPPLIER_QUOTE = 'supplier_quote',
  /** Derivado de una compra real de STP (gasto con cantidad y unitario). */
  EXPENSE = 'expense',
  /** Carga masiva desde archivo. */
  IMPORT = 'import',
  /** Referencia externa (p. ej. una publicación de mercado). NO es precio pagado por STP. */
  EXTERNAL_REF = 'external_ref',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Precio de un material en un momento, de un proveedor, en una región.
 *
 * **APPEND-ONLY**: no hay UPDATE ni DELETE de precios. Un precio equivocado se ANULA
 * (`voidedAt` + `voidReason`) y se inserta el correcto. El historial es el activo del
 * módulo; sobrescribir un precio destruye justamente lo que le da valor.
 *
 * El "precio vigente" de un material no es una columna: es la fila más reciente por
 * `date` (desempate por `createdAt`) que no esté anulada. Ver `price-selection.ts`.
 *
 * `netUnitPrice` es el campo comparable y el único que deben usar las agregaciones:
 * siempre en **DOP**, con el descuento aplicado y **sin ITBIS**. Se calcula en el
 * service al insertar (no es columna generada de Postgres a propósito: `synchronize`
 * en dev y las columnas generadas conviven mal, y aquí el service es el único escritor).
 */
@Index(['materialId', 'date'])
@Index(['materialId', 'supplierId', 'date'])
@Entity('material_prices')
export class MaterialPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Material, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string;

  /** Precio tal como se recibió, en la moneda y con los impuestos que indique el documento. */
  @Column({ type: 'numeric', precision: 14, scale: 4, transformer: dec })
  price: number;

  @Column({ type: 'enum', enum: PriceCurrency, default: PriceCurrency.DOP })
  currency: PriceCurrency;

  /** DOP por unidad de `currency`. Obligatorio si la moneda no es DOP. */
  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: dec })
  exchangeRate: number;

  @Column({ type: 'boolean', default: false })
  itbisIncluded: boolean;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 18, transformer: dec })
  itbisRate: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: dec })
  discountPct: number;

  /** Comparable: DOP, con descuento, sin ITBIS. Calculado por el service. */
  @Column({ type: 'numeric', precision: 14, scale: 4, transformer: dec })
  netUnitPrice: number;

  /** Cantidad mínima a la que aplica este precio (precio por volumen). */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: dec })
  minQuantity: number;

  @Column({ type: 'enum', enum: PriceRegion, default: PriceRegion.SANTO_DOMINGO })
  region: PriceRegion;

  /** Fecha de vigencia del precio (la del documento, no la de captura). */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', nullable: true })
  leadTimeDays: number;

  @Column({ type: 'enum', enum: PriceSource, default: PriceSource.MANUAL })
  source: PriceSource;

  /**
   * Documento soporte en `uploaded_files`. Puntero suelto a propósito (sin FK): evita
   * acoplar este módulo a FilesModule y que dev/prod difieran en constraints.
   */
  @Column({ type: 'uuid', nullable: true })
  documentId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'registeredById' })
  registeredBy: User;

  @Column({ type: 'uuid', nullable: true })
  registeredById: string;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  voidedById: string;

  @Column({ type: 'text', nullable: true })
  voidReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
