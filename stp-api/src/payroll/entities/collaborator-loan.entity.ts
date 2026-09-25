import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Collaborator } from '../../collaborators/entities/collaborator.entity';

export enum CollaboratorLoanStatus {
  ACTIVE = 'active',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

const dec = { to: (v: number) => v, from: (v: string) => (v != null ? parseFloat(v) : 0) };

/**
 * Préstamo/avance grande a un colaborador, descontado en cuotas de su nómina.
 * `balance` lo actualiza SIEMPRE el servicio de nómina al generar cada pago
 * (ver `PayrollService.create`/`remove`) — nunca se acepta del cliente.
 */
@Entity('collaborator_loans')
export class CollaboratorLoan {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Collaborator, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'collaboratorId' })
  collaborator: Collaborator;

  @Column({ type: 'uuid' })
  collaboratorId: string;

  /** Monto original del préstamo, fijo desde que se crea. */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  amount: number;

  /** Saldo pendiente por cobrar. Arranca igual a `amount`. */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  balance: number;

  /** Cuota a descontar por cada pago de nómina (se topa al saldo si es menor). */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  installmentAmount: number;

  @Column({ type: 'enum', enum: CollaboratorLoanStatus, default: CollaboratorLoanStatus.ACTIVE })
  status: CollaboratorLoanStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
