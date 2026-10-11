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
import { Expense } from '../../expenses/entities/expense.entity';
import { User } from '../../users/entities/user.entity';

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

/**
 * Comprobante fiscal de compra (una línea del Formato 606). Antes vivía en FiscoRD;
 * ahora es un módulo del ERP (ERP-35).
 *
 * Cuenta para el 606 tenga o no proyecto. El proyecto NO se guarda aquí: lo da el gasto
 * enlazado (`expense.projectId`); sin gasto, o con un gasto sin proyecto, la factura es
 * un gasto general de la empresa (ERP-34).
 */
@Entity('fiscal_invoices')
@Index('UQ_fiscal_invoices_supplier_ncf', ['supplierRnc', 'ncf'], { unique: true })
export class FiscalInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NCF o e-NCF completo, sin guiones (11 o 13 caracteres). */
  @Column({ type: 'varchar', length: 13 })
  ncf: string;

  /** Deducido de las 3 primeras letras del NCF (B01, E31…). */
  @Column({ type: 'varchar', length: 3 })
  ncfType: string;

  /** RNC (9) o cédula (11) del emisor, solo dígitos. */
  @Column({ type: 'varchar', length: 11 })
  supplierRnc: string;

  @Column({ type: 'varchar', length: 255 })
  supplierName: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  baseAmount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  itbis: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  isc: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  tip: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  otherTax: number;

  /** base + ITBIS + ISC + propina + otros, calculado en el servidor. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: dec })
  totalAmount: number;

  /** Código de forma de pago del 606 (01–07). */
  @Column({ type: 'varchar', length: 2, default: '01' })
  paymentMethod: string;

  /**
   * Código de tipo de gasto del 606 (01–11). Las facturas migradas de FiscoRD pueden
   * traer otros valores ('12', '99'): la columna no los restringe, solo el DTO.
   */
  @Column({ type: 'varchar', length: 2 })
  expenseType: string;

  @Column({ type: 'date' })
  invoiceDate: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Código de seguridad del e-CF (sale en el QR): la DGII lo pide, junto con el RNC del
   * comprador, para confirmar un e-NCF. Los NCF de papel no lo llevan.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  securityCode: string | null;

  /** Foto o PDF del comprobante, relativo a la raíz de subidas. */
  @Column({ type: 'text', nullable: true })
  photoPath: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  photoMimetype: string | null;

  /** Resultado de la consulta a la DGII: Aceptado, Rechazado, No encontrado… */
  @Column({ type: 'varchar', length: 50, nullable: true })
  dgiiEstado: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  dgiiValidatedAt: Date | null;

  /** Gasto del ERP que esta factura originó (ERP-39); lleva el proyecto, si lo hay. */
  @ManyToOne(() => Expense, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'expenseId' })
  expense: Expense | null;

  @Column({ type: 'uuid', nullable: true })
  expenseId: string | null;

  /**
   * `true`: el gasto nació de esta factura (se sincroniza con ella y se borra con ella).
   * `false`: el gasto ya existía, tecleado a mano, y la factura solo se vinculó a él (ERP-50):
   * no se le pisan los datos ni se borra al borrar la factura.
   */
  @Column({ type: 'boolean', default: true })
  expenseOwned: boolean;

  /** Id de la factura en FiscoRD, para que la migración no duplique si se repite. */
  @Index('UQ_fiscal_invoices_legacy', { unique: true, where: '"legacyId" IS NOT NULL' })
  @Column({ type: 'varchar', length: 64, nullable: true })
  legacyId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
