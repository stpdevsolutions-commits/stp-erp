import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Categoría de material, jerárquica (`parentId`). Es también el esqueleto de la
 * futura biblioteca de partidas: 02 Eléctrico → 0201 Canalización → 020101 EMT.
 * Los códigos y el árbol los define STP; no se siembran por defecto.
 */
@Entity('material_categories')
export class MaterialCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => MaterialCategory, { nullable: true, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'parentId' })
  parent: MaterialCategory;

  @Column({ type: 'uuid', nullable: true })
  parentId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
