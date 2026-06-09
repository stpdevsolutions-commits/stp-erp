import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum InventoryCategory {
  MATERIALS = 'materials',
  EQUIPMENT = 'equipment',
  TOOLS = 'tools',
  ELECTRICAL = 'electrical',
  MECHANICAL = 'mechanical',
  CONSUMABLES = 'consumables',
  OTHER = 'other',
}

const dec = { to: (v: number) => v, from: (v: string) => (v != null ? parseFloat(v) : 0) };

@Entity('inventory_items')
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ nullable: true }) sku: string;
  @Column({ type: 'enum', enum: InventoryCategory, default: InventoryCategory.OTHER }) category: InventoryCategory;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec }) quantity: number;
  @Column({ nullable: true }) unit: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec }) cost: number;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: dec }) price: number;
  @Column({ nullable: true }) location: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: dec }) minStock: number;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
