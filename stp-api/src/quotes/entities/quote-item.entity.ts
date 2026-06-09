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

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
