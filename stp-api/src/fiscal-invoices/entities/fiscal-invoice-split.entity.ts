import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Expense } from '../../expenses/entities/expense.entity';
import { Project } from '../../projects/entities/project.entity';
import { FiscalInvoice } from './fiscal-invoice.entity';

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Línea de reparto de una factura fiscal (ERP-81): cuánto de la factura va a un proyecto
 * (o al gasto general, `projectId` null) y el gasto propio que esa línea originó.
 *
 * Una factura SIN dividir no tiene líneas: sigue usando `FiscalInvoice.expenseId`. Una dividida
 * (2 o más líneas) tiene `expenseId` null y un gasto por línea. Un destino no se repite
 * (índices únicos): el mismo proyecto dos veces se fusiona antes de guardar.
 */
@Entity('fiscal_invoice_splits')
@Index('UQ_fiscal_invoice_splits_project', ['fiscalInvoiceId', 'projectId'], {
  unique: true,
  where: '"projectId" IS NOT NULL',
})
@Index('UQ_fiscal_invoice_splits_general', ['fiscalInvoiceId'], {
  unique: true,
  where: '"projectId" IS NULL',
})
export class FiscalInvoiceSplit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FiscalInvoice, (inv) => inv.splits, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fiscalInvoiceId' })
  fiscalInvoice: FiscalInvoice;

  @Column({ type: 'uuid' })
  fiscalInvoiceId: string;

  /** Sin proyecto = gasto general de la empresa. */
  @ManyToOne(() => Project, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: dec })
  amount: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /**
   * Gasto que esta línea originó (nace con la línea y se borra con ella). Si alguien borra ese
   * gasto a mano queda `null`: el reparto sigue intacto y al guardarlo de nuevo se regenera.
   */
  @ManyToOne(() => Expense, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'expenseId' })
  expense: Expense | null;

  @Column({ type: 'uuid', nullable: true })
  expenseId: string | null;

  /** Orden en que se muestran las líneas. */
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
