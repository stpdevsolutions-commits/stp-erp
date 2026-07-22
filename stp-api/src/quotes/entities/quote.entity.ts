import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { QuoteItem } from './quote-item.entity';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : 0),
};

/**
 * Gasto indirecto aplicado sobre el subtotal de costos directos (los items).
 * - `kind` undefined = gasto normal (amount = base * pct/100).
 * - `kind` 'itbis'  = entrada especial: amount = pct% del monto de los gastos
 *                     marcados como `taxable` (por defecto, Dirección Técnica).
 * El backend SIEMPRE recalcula `amount` server-side; el valor recibido se ignora.
 */
export interface IndirectCost {
  name: string;
  pct: number;
  amount: number;
  kind?: 'itbis';
  taxable?: boolean;
}

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  number: string;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @Column({ type: 'date', nullable: true })
  validUntil: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 18, transformer: dec })
  taxRate: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  discount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  subtotal: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  taxAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  total: number;

  /**
   * Desglose de gastos indirectos. `null` = cotización legacy (ITBIS 18% clásico
   * sobre subtotal - discount). Presente = modo gastos indirectos.
   */
  @Column({ type: 'jsonb', nullable: true })
  indirectCosts: IndirectCost[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  terms: string;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
