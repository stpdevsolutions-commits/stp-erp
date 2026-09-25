import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Material } from '../../costs/entities/material.entity';

/**
 * Enlace de un insumo de la calculadora (su `clave` estable: "cemento_gris",
 * "block_6", "thhn_12"...) con un material del catálogo del ERP, que es de
 * donde sale el precio. Se enlaza UNA vez — desde la app, la primera vez que
 * aparece sin precio — y vale para todos los cálculos siguientes.
 *
 * CASCADE: si se borra el material del catálogo, el insumo vuelve a quedar
 * "sin precio" en vez de apuntar a la nada.
 */
@Entity('calc_material_links')
export class CalcMaterialLink {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  clave: string;

  @ManyToOne(() => Material, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  @Column({ type: 'uuid' })
  materialId: string;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
