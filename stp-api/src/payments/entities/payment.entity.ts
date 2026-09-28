import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Project } from '../../projects/entities/project.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { User } from '../../users/entities/user.entity';

export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  CHECK = 'check',
  CARD = 'card',
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @ManyToOne(() => Quote, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'quoteId' })
  quote: Quote;

  @Column({ type: 'uuid', nullable: true })
  quoteId: string;

  @Column()
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.TRANSFER })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  // ── Comprobante fiscal electrónico (e-CF) ──────────────────────────────────
  // El comprobante vive en ecf-api (proyecto eCF-SaaS, base de datos aparte).
  // Aquí guardamos solo el enlace (`ecfId`) y lo que hay que mostrar en el ERP.
  // Todo nullable: no todos los pagos se facturan electrónicamente.

  /** Id del comprobante en ecf-api. */
  @Column({ type: 'uuid', nullable: true })
  ecfId: string | null;

  /** eNCF asignado (ej. E310000000001). */
  @Column({ type: 'varchar', nullable: true })
  ecfEncf: string | null;

  /** Tipo de e-CF emitido (ej. e-CF_31_v_1_0). */
  @Column({ type: 'varchar', nullable: true })
  ecfTipo: string | null;

  /** UUID que devuelve la DGII. */
  @Column({ type: 'varchar', nullable: true })
  ecfUuid: string | null;

  /** Estado del comprobante en ecf-api (borrador, firmado, transmitido, aceptado...). */
  @Column({ type: 'varchar', nullable: true })
  ecfEstado: string | null;

  /** Código de seguridad de la DGII (para el QR). */
  @Column({ type: 'varchar', nullable: true })
  ecfCodigoSeguridad: string | null;

  /** URL del QR de consulta del comprobante. */
  @Column({ type: 'text', nullable: true })
  ecfQrUrl: string | null;

  /** Último error al intentar emitir/transmitir, si lo hubo. */
  @Column({ type: 'text', nullable: true })
  ecfError: string | null;

  /** Cuándo se emitió el e-CF. */
  @Column({ type: 'timestamptz', nullable: true })
  ecfEmitidoAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
