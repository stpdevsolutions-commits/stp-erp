import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { User } from '../../users/entities/user.entity';
import { Unit } from '../../costs/entities/unit.entity';
import { Material } from '../../costs/entities/material.entity';

export enum ExpenseCategory {
  MATERIALS = 'materials',
  LABOR = 'labor',
  EQUIPMENT = 'equipment',
  SUBCONTRACT = 'subcontract',
  TRAVEL = 'travel',
  OTHER = 'other',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: ExpenseCategory, default: ExpenseCategory.OTHER })
  category: ExpenseCategory;

  /**
   * Importe total del gasto. Cuando hay `quantity` y `unitPrice`, el servidor lo
   * RECALCULA (cantidad × unitario) para que no puedan contradecirse.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  amount: number;

  /**
   * Desglose opcional del gasto en cantidad × unitario. Es lo que convierte un gasto
   * en un dato de precio aprovechable: sin cantidad ni unidad, "RD$12,500 en cable"
   * no dice nada del precio del cable. Si además se indica `materialId`, el módulo de
   * costos deriva un precio real de compra (`material_prices.source = 'expense'`).
   */
  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true, transformer: dec })
  quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true, transformer: dec })
  unitPrice: number;

  @ManyToOne(() => Unit, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'unitId' })
  unit: Unit;

  @Column({ type: 'uuid', nullable: true })
  unitId: string;

  @ManyToOne(() => Material, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'uuid', nullable: true })
  materialId: string;

  /** Si el unitario ya trae el ITBIS dentro. Determina el precio neto comparable. */
  @Column({ type: 'boolean', default: false })
  itbisIncluded: boolean;

  @Column({ type: 'date' })
  date: string;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
