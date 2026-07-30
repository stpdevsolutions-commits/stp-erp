import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Unit } from './unit.entity';
import { MaterialCategory } from './material-category.entity';

/**
 * Material del catálogo maestro. Código auto `MAT-00001`.
 *
 * `normalizedName` es el nombre en minúsculas y sin acentos/puntuación, y existe para
 * el problema real de este módulo: el mismo material llega con tres nombres distintos
 * según el proveedor ("Cable THHN #12", "Alambre THHN 12 AWG", "THHN #12 Phelps Dodge").
 * Hoy sirve para detectar duplicados por texto; más adelante es la entrada del
 * emparejamiento por embeddings.
 */
@Entity('materials')
export class Material {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column()
  name: string;

  @Index()
  @Column({ type: 'varchar' })
  normalizedName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => MaterialCategory, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'categoryId' })
  category: MaterialCategory;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'unitId' })
  unit: Unit;

  @Column({ type: 'uuid' })
  unitId: string;

  @Column({ type: 'varchar', nullable: true })
  brand: string;

  @Column({ type: 'varchar', nullable: true })
  model: string;

  @Column({ type: 'varchar', nullable: true })
  barcode: string;

  /** Ficha técnica libre: calibre, voltaje, peso, rendimiento del fabricante, etc. */
  @Column({ type: 'jsonb', nullable: true })
  specs: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
