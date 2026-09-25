import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { FileUpload } from '../../files/entities/file-upload.entity';

const dec = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v != null ? parseFloat(v) : null),
};

/**
 * Un cálculo de la calculadora de materiales de la app de técnicos (MOB-1),
 * guardado en un proyecto. Las cantidades las calcula la app (funciona sin
 * conexión); el servidor le pone precio con el catálogo vigente al guardarlo
 * y archiva el PDF en los documentos del proyecto.
 *
 * `result` guarda el cálculo TAL COMO SE GUARDÓ, precios incluidos: un
 * cálculo archivado no debe cambiar solo porque después suba el cemento —
 * mismo criterio que la cotización al aprobarse.
 */
@Entity('material_calcs')
@Index(['projectId', 'createdAt'])
export class MaterialCalc {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'uuid' })
  projectId: string;

  /** Id de la calculadora en la app ("block", "losa"...). */
  @Column({ type: 'varchar', length: 40 })
  calculatorId: string;

  /** "Muro de block", "Losa de hormigón"... */
  @Column({ type: 'varchar', length: 120 })
  title: string;

  /** Valores del formulario, para poder reabrir el cálculo. */
  @Column({ type: 'jsonb' })
  inputs: Record<string, unknown>;

  /** Resultado + lista de materiales con precios congelados al guardar. */
  @Column({ type: 'jsonb' })
  result: Record<string, unknown>;

  /** Total de materiales valorados (RD$). Null si ningún material tenía precio. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: dec })
  totalMaterials: number | null;

  /** PDF archivado en los documentos del proyecto. */
  @ManyToOne(() => FileUpload, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fileId' })
  file: FileUpload | null;

  @Column({ type: 'uuid', nullable: true })
  fileId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
