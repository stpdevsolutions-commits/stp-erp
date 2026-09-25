import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Collaborator } from '../../collaborators/entities/collaborator.entity';
import { Project } from '../../projects/entities/project.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { User } from '../../users/entities/user.entity';
import { CollaboratorLoan } from './collaborator-loan.entity';

/**
 * Cómo se calculó la cantidad base del pago. `daysWorked`/`dailyRate` se leen
 * como "cantidad"/"tarifa unitaria" genéricas según este campo — cantidad ×
 * tarifa es la misma cuenta sea la unidad días, m², m³ o ml. Para LUMP_SUM
 * (P.A. — Partida Alzada) la cantidad queda fija en 1 y `dailyRate` guarda el
 * monto escrito a mano.
 */
export enum PayrollPaymentType {
  DAY = 'day',
  M2 = 'm2',
  M3 = 'm3',
  ML = 'ml',
  LUMP_SUM = 'lump_sum',
}

export enum PayrollMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  CHECK = 'check',
  OTHER = 'other',
}

export enum PayrollStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Un pago de nómina a un colaborador por un período trabajado.
 *
 * `grossAmount`, `retentionAmount` y `netAmount` los RECALCULA siempre el servidor
 * a partir de días × tarifa + extras + bonos − descuentos − retención (ver
 * `payroll-amounts.ts`), igual que hace `expenses` con cantidad × unitario: así no
 * pueden contradecirse.
 */
@Entity('payroll_entries')
export class PayrollEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Correlativo legible NOM-YYYY-NNN. */
  @Index({ unique: true })
  @Column()
  number: string;

  @ManyToOne(() => Collaborator, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'collaboratorId' })
  collaborator: Collaborator;

  @Column({ type: 'uuid' })
  collaboratorId: string;

  /**
   * Proyecto al que se imputa la mano de obra. Opcional: hay pagos de personal
   * fijo que no pertenecen a una obra. Sin proyecto NO se genera gasto (la
   * tabla `expenses` exige `projectId`).
   */
  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @Column({ type: 'date' })
  periodStart: string;

  @Column({ type: 'date' })
  periodEnd: string;

  @Column({ type: 'enum', enum: PayrollPaymentType, default: PayrollPaymentType.DAY })
  paymentType: PayrollPaymentType;

  /** Cantidad (días, m², m³ o ml según `paymentType`; 1 fijo si es P.A.). */
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: dec })
  daysWorked: number;

  /** Tarifa unitaria aplicada (o el monto de P.A.). Se copia de la del colaborador
   *  solo cuando `paymentType` es DAY, pero siempre es editable y queda congelada. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: dec })
  dailyRate: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  overtimeAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  bonuses: number;

  /** Avances entregados durante el período, descuentos por herramienta, etc. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  deductions: number;

  /** Motivo del descuento/avance, en texto libre. */
  @Column({ type: 'varchar', nullable: true })
  discountReason: string;

  /**
   * Préstamo (ERP-91) del que se descontó una cuota en este pago, si aplica.
   * El servidor lo asigna solo al crear el pago (busca un préstamo activo del
   * colaborador); la cuota queda incluida dentro de `deductions` para que el
   * cálculo de `netAmount` no cambie, y `loanDeductionAmount` guarda cuánto de
   * ese total vino del préstamo, para poder revertirlo si el pago se borra
   * (ver PayrollService.remove).
   */
  @ManyToOne(() => CollaboratorLoan, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'loanId' })
  loan: CollaboratorLoan | null;

  @Column({ type: 'uuid', nullable: true })
  loanId: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: dec })
  loanDeductionAmount: number | null;

  /** Porcentaje de retención aplicado sobre el bruto (0–100). Lo escribe el usuario. */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: dec })
  retentionPercent: number;

  /** Importe retenido: lo calcula SIEMPRE el servidor a partir del porcentaje. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec })
  retentionAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  grossAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  netAmount: number;

  @Column({ type: 'enum', enum: PayrollStatus, default: PayrollStatus.PENDING })
  status: PayrollStatus;

  @Column({ type: 'enum', enum: PayrollMethod, default: PayrollMethod.CASH })
  method: PayrollMethod;

  @Column({ type: 'date', nullable: true })
  paymentDate: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  /**
   * Gasto de mano de obra generado al marcar el pago como pagado. El servicio lo
   * crea, actualiza y borra siguiendo el estado; ON DELETE SET NULL es solo la red
   * de seguridad si alguien borra el gasto a mano.
   */
  @ManyToOne(() => Expense, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'expenseId' })
  expense: Expense;

  @Column({ type: 'uuid', nullable: true })
  expenseId: string;

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
