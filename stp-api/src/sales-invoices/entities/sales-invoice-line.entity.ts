import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SalesInvoice } from './sales-invoice.entity';

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : 0),
};

/** Una línea de la factura. El precio unitario es SIEMPRE antes de ITBIS. */
@Entity('sales_invoice_lines')
export class SalesInvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SalesInvoice, (i) => i.lines, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: SalesInvoice;

  @Column({ type: 'uuid' })
  invoiceId: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column()
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 1, transformer: dec })
  quantity: number;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: dec })
  unitPrice: number;

  /** 18, 16 o 0 (exento). */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 18, transformer: dec })
  itbisRate: number;

  /** 1 = bien, 2 = servicio (lo pide el e-CF). */
  @Column({ type: 'int', default: 2 })
  goodOrService: number;

  /** cantidad × precio, antes de ITBIS. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  total: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  itbisAmount: number;
}
