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
import { Quote } from '../../quotes/entities/quote.entity';
import { User } from '../../users/entities/user.entity';
import { SalesInvoiceLine } from './sales-invoice-line.entity';

export enum SalesInvoiceStatus {
  /** Se puede editar y borrar; todavía no existe ante la DGII. */
  DRAFT = 'draft',
  /** Reservada mientras ecf-api crea/firma el comprobante (evita emitir dos veces). */
  EMITTING = 'emitting',
  /** Ya tiene e-NCF: no se edita ni se borra (corregirla es una nota de crédito). */
  ISSUED = 'issued',
}

export enum SalesInvoiceKind {
  INVOICE = 'invoice',
  /** Nota de crédito (e-CF 34): anula o corrige una factura ya emitida. */
  CREDIT_NOTE = 'credit_note',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Factura de venta (emitida a un cliente) con comprobante fiscal electrónico.
 *
 * La factura es EL documento de venta y se emite una sola vez. Los cobros del cliente
 * (`payments`) se aplican a ella como abonos (`payments.salesInvoiceId`): así un cliente
 * puede pagar un proyecto en varias partes sin que se emita —ni se cuente— más de una
 * vez el mismo monto. Saldo = total − suma de cobros aplicados.
 */
@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Número interno correlativo por año (FAC-2026-001); el fiscal es `ecfEncf`. */
  @Column({ unique: true })
  number: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  /** Cotización de la que sale (si salió de una). */
  @ManyToOne(() => Quote, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'quoteId' })
  quote: Quote | null;

  @Column({ type: 'uuid', nullable: true })
  quoteId: string | null;

  /** Qué porción de la cotización cubre esta factura (100 = toda). */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: dec })
  quotePercent: number | null;

  @Column({ type: 'enum', enum: SalesInvoiceKind, default: SalesInvoiceKind.INVOICE })
  kind: SalesInvoiceKind;

  /** En una nota de crédito: la factura que modifica. */
  @ManyToOne(() => SalesInvoice, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'relatedInvoiceId' })
  relatedInvoice: SalesInvoice | null;

  @Column({ type: 'uuid', nullable: true })
  relatedInvoiceId: string | null;

  /** Código de modificación del e-CF: 1 anula la factura, 3 corrige montos. */
  @Column({ type: 'int', nullable: true })
  modificationCode: number | null;

  /** Motivo de la nota de crédito (máx. 90 caracteres, lo exige el e-CF). */
  @Column({ type: 'varchar', length: 90, nullable: true })
  reason: string | null;

  @Column({ type: 'date' })
  issueDate: string;

  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: SalesInvoiceStatus, default: SalesInvoiceStatus.DRAFT })
  status: SalesInvoiceStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  subtotal: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  itbis: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  total: number;

  @OneToMany(() => SalesInvoiceLine, (l) => l.invoice, { cascade: true })
  lines: SalesInvoiceLine[];

  // ── Comprobante fiscal electrónico (vive en ecf-api; aquí solo el enlace) ──
  @Column({ type: 'varchar', nullable: true })
  ecfId: string | null;

  @Column({ type: 'varchar', nullable: true })
  ecfEncf: string | null;

  @Column({ type: 'varchar', nullable: true })
  ecfTipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ecfUuid: string | null;

  @Column({ type: 'varchar', nullable: true })
  ecfEstado: string | null;

  @Column({ type: 'varchar', nullable: true })
  ecfCodigoSeguridad: string | null;

  @Column({ type: 'text', nullable: true })
  ecfQrUrl: string | null;

  @Column({ type: 'text', nullable: true })
  ecfError: string | null;

  /** Último mensaje de la DGII sobre el comprobante (p. ej. el motivo de un rechazo). */
  @Column({ type: 'text', nullable: true })
  ecfMensaje: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ecfEmitidoAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // No son columnas: los rellena el servicio al leer.
  paidAmount?: number;
  /** Notas de crédito emitidas contra esta factura. */
  creditedAmount?: number;
  /** total − notas de crédito. */
  netTotal?: number;
  /** netTotal − cobros (negativo = a favor del cliente). */
  balance?: number;
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'void' | null;
  overdue?: boolean;
}
