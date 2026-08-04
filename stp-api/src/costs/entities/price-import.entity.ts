import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { User } from '../../users/entities/user.entity';
import { PriceImportLine } from './price-import-line.entity';

export enum PriceImportStatus {
  /** Encolado, esperando al worker. */
  PENDING = 'pending',
  /** El worker lo tiene: leyendo el PDF y extrayendo. */
  PROCESSING = 'processing',
  /** Extraído. Espera que una persona apruebe línea por línea. */
  REVIEW = 'review',
  /** Todas las líneas resueltas (aprobadas o descartadas). */
  DONE = 'done',
  /** La extracción falló. `error` dice por qué. */
  FAILED = 'failed',
}

/**
 * Un PDF de cotización de proveedor del que se extraen precios con IA.
 *
 * **Nada de lo que extrae la IA entra a `material_prices` por su cuenta**: cada línea
 * nace como borrador y solo se convierte en precio cuando una persona la aprueba
 * (ver `PriceImportLine`). El módulo de Costos vale por la confianza en su historial;
 * un precio inventado por un modelo lo destruye más rápido que la falta de datos.
 *
 * El PDF NO se guarda en `uploaded_files`: esa tabla cuelga de un cliente
 * (`clientId` no es nullable) y una cotización de proveedor no pertenece a ninguno.
 * Se guarda en disco bajo `costs/imports/` y aquí queda su ruta.
 */
@Entity('price_imports')
export class PriceImport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nombre con el que subieron el archivo, para mostrarlo en la lista. */
  @Column()
  originalName: string;

  /** Ruta del PDF relativa a la raíz de subidas. */
  @Column()
  path: string;

  @Column({ type: 'int' })
  size: number;

  @Index()
  @Column({ type: 'enum', enum: PriceImportStatus, default: PriceImportStatus.PENDING })
  status: PriceImportStatus;

  /**
   * Proveedor al que se imputan los precios. Lo elige quien sube el archivo: adivinarlo
   * del PDF sería otra cosa más que verificar, y el proveedor ya se conoce al subirlo.
   */
  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string;

  /** Fecha del documento según la IA (YYYY-MM-DD). Es la fecha de vigencia de los precios. */
  @Column({ type: 'date', nullable: true })
  documentDate: string;

  /** Modelo que hizo la extracción, para poder auditar una tanda dudosa. */
  @Column({ type: 'varchar', nullable: true })
  model: string;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  /** Motivo del fallo cuando `status = failed`. */
  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @OneToMany(() => PriceImportLine, (line) => line.import, { cascade: ['insert'] })
  lines: PriceImportLine[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
