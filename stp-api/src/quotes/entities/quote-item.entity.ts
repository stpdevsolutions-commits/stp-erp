import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Quote } from './quote.entity';
import { Acu } from '../../costs/entities/acu.entity';
import type { QuoteItemKind } from '../quote-tree';

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : 0),
};

/** Igual que `dec`, pero conserva el NULL: en las columnas del ACU "sin dato" no es 0. */
const dec4 = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : null),
};

@Entity('quote_items')
export class QuoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Quote, (quote) => quote.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quoteId' })
  quote: Quote;

  @Column({ type: 'uuid' })
  quoteId: string;

  /**
   * Partida padre. Null = está en la raíz de la cotización. El árbol no tiene
   * profundidad fija: "Baño" → "Piso" → "Materiales" → líneas (ver quote-tree.ts).
   * CASCADE: borrar una partida se lleva todo lo que cuelga de ella.
   */
  @ManyToOne(() => QuoteItem, { nullable: true, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'parentId' })
  parent: QuoteItem;

  @Column({ type: 'uuid', nullable: true })
  parentId: string;

  /**
   * `group` agrupa y su total es la suma de sus descendientes (cantidad y precio
   * quedan a 0); `item` es la línea con cantidad × unitario. Lo decide el
   * servidor, no el cliente: un nodo con hijos es siempre grupo.
   */
  @Column({ type: 'varchar', default: 'item' })
  kind: QuoteItemKind;

  @Column()
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: dec })
  quantity: number;

  @Column({ type: 'varchar', nullable: true })
  unit: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  unitPrice: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: dec })
  discountPct: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: dec })
  total: number;

  /** Orden entre hermanos (dentro del mismo `parentId`), no global. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // ── Origen del unitario: partida de costos (ACU) ───────────────────────────
  //
  // Cuando la línea nace de una receta, el unitario deja de escribirse a mano y sale
  // del costo real de sus insumos. Lo que se guarda aquí es el CONGELADO: el costo del
  // día en que se cotizó, no el de hoy. Una cotización enviada al cliente no puede
  // cambiar de precio sola; el sistema avisa del desfase (`acu-pricing.ts`) y actualizar
  // es siempre una decisión humana.
  //
  // RESTRICT y no SET NULL: perder en silencio de dónde salió un precio ya cotizado es
  // peor que no poder borrar la partida. Para retirarla de circulación está `isActive`.

  @ManyToOne(() => Acu, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'acuId' })
  acu: Acu;

  @Column({ type: 'uuid', nullable: true })
  acuId: string;

  /** Costo directo del ACU en el momento de congelar. 4 decimales, como el ACU. */
  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true, transformer: dec4 })
  acuUnitCost: number;

  /**
   * Margen aplicado sobre ese costo para llegar al unitario de venta. Va en la LÍNEA y
   * no en el ACU porque la misma partida se cotiza con margen distinto según la obra;
   * guardarlo aparte es lo que permite comparar costo contra costo sin mezclar el margen.
   */
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: dec4 })
  acuMarkupPct: number;

  @Column({ type: 'timestamp', nullable: true })
  acuPricedAt: Date;

  /**
   * El ACU estaba incompleto al congelar (algún material sin precio vigente): el
   * unitario es un piso, no el costo real. Se guarda para que el aviso siga vivo — un
   * dato malo no deja de serlo porque se haya guardado.
   */
  @Column({ type: 'boolean', default: false })
  acuIncomplete: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
