import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UnitKind {
  COUNT = 'count',
  LENGTH = 'length',
  AREA = 'area',
  VOLUME = 'volume',
  MASS = 'mass',
  TIME = 'time',
  OTHER = 'other',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Unidad de medida. `baseUnitId` + `factor` dejan la puerta abierta a la conversión
 * (1 qq = 45.359237 kg) sin necesidad de otra migración: una unidad con baseUnit
 * declarada es convertible a su base multiplicando por `factor`.
 */
@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: UnitKind, default: UnitKind.OTHER })
  kind: UnitKind;

  @ManyToOne(() => Unit, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'baseUnitId' })
  baseUnit: Unit;

  @Column({ type: 'uuid', nullable: true })
  baseUnitId: string;

  @Column({ type: 'numeric', precision: 18, scale: 8, nullable: true, transformer: dec })
  factor: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
