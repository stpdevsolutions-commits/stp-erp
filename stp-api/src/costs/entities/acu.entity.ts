import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Unit } from './unit.entity';
import { AcuItem } from './acu-item.entity';

/** Oficio al que pertenece la partida. Los dos que factura STP hoy. */
export enum AcuTrade {
  ELECTRICAL = 'electrical',
  CIVIL = 'civil',
  MECHANICAL = 'mechanical',
  OTHER = 'other',
}

/**
 * ACU — Análisis de Costos Unitarios. Una partida de obra ("salida eléctrica",
 * "m2 de pañete") descompuesta en los insumos que consume UNA unidad de ella.
 *
 * **El costo NO es una columna.** Se calcula al vuelo con los precios vigentes del
 * catálogo (`acu-cost.ts`). Guardar el unitario lo congelaría, y un unitario congelado
 * envejece sin avisar — que es justo el problema que este módulo existe para resolver.
 * Quien congela es la cotización al aprobarse, no el ACU.
 *
 * `unit` es la unidad de la PARTIDA (el "por m2" de "RD$450 por m2"), distinta de las
 * unidades de sus insumos.
 */
@Entity('acus')
export class Acu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column()
  name: string;

  /** Mismo criterio que en `materials`: detectar la misma partida escrita distinto. */
  @Index()
  @Column({ type: 'varchar' })
  normalizedName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'unitId' })
  unit: Unit;

  @Column({ type: 'uuid' })
  unitId: string;

  @Column({ type: 'enum', enum: AcuTrade, default: AcuTrade.ELECTRICAL })
  trade: AcuTrade;

  /**
   * Capítulo del presupuesto ("1. DEMOLICIONES Y DESMONTES"). Texto libre y no una
   * tabla aparte a propósito: los capítulos los dicta cada tarifario de cliente y
   * cambian entre obras; normalizarlos ahora sería inventar una jerarquía que nadie pidió.
   */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  chapter: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => AcuItem, (item) => item.acu, { cascade: false })
  items: AcuItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
