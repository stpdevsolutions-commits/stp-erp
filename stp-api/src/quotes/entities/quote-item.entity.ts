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
import type { QuoteItemKind } from '../quote-tree';

const dec = {
  to: (v: number) => v,
  from: (v: string) => (v != null ? parseFloat(v) : 0),
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
