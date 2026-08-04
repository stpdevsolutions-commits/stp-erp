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
import { Acu } from './acu.entity';
import { Unit } from './unit.entity';
import { Material } from './material.entity';
import type { AcuItemKind, AcuLaborBasis } from '../acu-cost';

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Una línea de la receta de un ACU: material, mano de obra o equipo.
 *
 * Polimórfica en una sola tabla (decisión de la Fase 1, no tres tablas paralelas): las
 * tres se comportan igual —cantidad × costo unitario— y separarlas obligaría a unir tres
 * consultas para calcular un solo número.
 */
@Index(['acuId', 'sortOrder'])
@Entity('acu_items')
export class AcuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Acu, (acu) => acu.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'acuId' })
  acu: Acu;

  @Column({ type: 'uuid' })
  acuId: string;

  @Column({ type: 'varchar', default: 'material' })
  kind: AcuItemKind;

  /**
   * Material del catálogo, del que sale el precio vigente. Solo en `kind = 'material'`.
   *
   * **RESTRICT**: no se puede borrar un material que alguna receta usa. Con CASCADE, borrar
   * un material vaciaría partidas en silencio y sus unitarios bajarían sin que nadie lo
   * note — misma guarda que impide borrar un material con precios.
   */
  @ManyToOne(() => Material, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  materialId: string;

  /** Obligatoria en mano de obra y equipo; en materiales rellena el nombre del catálogo. */
  @Column({ type: 'varchar', nullable: true })
  description: string;

  /** Unidad del INSUMO (pie de cable, día de electricista), no la de la partida. */
  @ManyToOne(() => Unit, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'unitId' })
  unit: Unit;

  @Column({ type: 'uuid', nullable: true })
  unitId: string;

  /**
   * Consumo por unidad de partida. 6 decimales porque los rendimientos son fracciones
   * pequeñas (0.0417 días de oficial por unidad) y 2 los aplastaría a cero.
   */
  @Column({ type: 'numeric', precision: 16, scale: 6, default: 0, transformer: dec })
  quantity: number;

  /**
   * Costo unitario. En materiales es opcional: vacío = usar el precio vigente del
   * catálogo, que es lo normal. En mano de obra y equipo es la tarifa y sí hace falta.
   */
  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true, transformer: dec })
  unitCost: number;

  /** `yield` (rendimiento × tarifa) o `pct_materials` (% sobre los materiales). */
  @Column({ type: 'varchar', nullable: true })
  basis: AcuLaborBasis;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: dec })
  pct: number;

  /** Desperdicio en %: recortes, empalmes, roturas. Sube la cantidad, no el precio. */
  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: dec })
  wastePct: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
