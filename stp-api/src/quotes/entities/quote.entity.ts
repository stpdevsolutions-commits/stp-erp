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
 * - `kind` 'itbis'  = entrada especial: amount = pct% de la base de `baseMode`.
 *   - `baseMode` 'gravables' (default) = base = suma de los gastos marcados
 *     `taxable` (por defecto, Dirección Técnica) — ITBIS solo sobre servicios.
 *   - `baseMode` 'total' = base = subtotal + todos los demás gastos
 *     indirectos — ITBIS sobre la factura completa.
 * El backend SIEMPRE recalcula `amount` server-side; el valor recibido se ignora.
 */
export interface IndirectCost {
  name: string;
  pct: number;
  amount: number;
  kind?: 'itbis';
  taxable?: boolean;
  baseMode?: 'gravables' | 'total';
}

/** Resumen ligero de una revisión, para el historial del detalle. */
export interface QuoteRevisionSummary {
  id: string;
  number: string;
  revision: number;
  status: QuoteStatus;
  total: number;
  createdAt: Date;
  supersededById: string | null;
}

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  number: string;

  /**
   * Número base legible compartido por toda la familia de revisiones
   * (p. ej. `COT-2026-001`). En la revisión 1 coincide con `number`; en las
   * revisiones posteriores `number` lleva el sufijo `-R{n}` pero `baseNumber`
   * permanece constante. Es la clave de agrupación de la familia.
   */
  @Column()
  baseNumber: string;

  /** Número de revisión dentro de la familia. 1 = original. */
  @Column({ type: 'int', default: 1 })
  revision: number;

  /**
   * Si está presente, esta cotización fue REEMPLAZADA por la revisión indicada
   * y queda como documento histórico: no puede reenviarse, aprobarse ni
   * rechazarse. La revisión vigente de una familia es la que tiene
   * `supersededById = null`.
   */
  @Column({ type: 'uuid', nullable: true })
  supersededById: string;

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

  /** Última transición a SENT — base del ciclo de recordatorios al cliente. */
  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date;

  @Column({ type: 'int', default: 0 })
  reminderCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastReminderAt: Date;

  /** Auditoría de la decisión del cliente vía enlace del correo. */
  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date;

  @Column({ nullable: true })
  decisionIp: string;

  @Column({ type: 'text', nullable: true })
  decisionUserAgent: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  terms: string;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];

  /**
   * Resumen de todas las revisiones de la familia (no es una columna: lo
   * rellena `findOne()` para el historial del detalle). Ordenado por revisión.
   */
  revisions?: QuoteRevisionSummary[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
