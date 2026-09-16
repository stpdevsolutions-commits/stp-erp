import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';

/** Mismo idioma de estados que Ticket, pero recortado a lo que tiene sentido
 * para una etapa/sprint: se planea, está activa, se cierra, o se cancela.
 * No hay "review" — una etapa no se revisa, se revisan sus tickets. */
export enum SprintStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

/** Una etapa de desarrollo con fecha de inicio y fin. Agrupa tickets para
 * poder ver el timeline ("qué hicimos, qué falta") sin depender de que cada
 * ticket tenga una fecha propia. Puede ser de un proyecto (projectId) o
 * transversal (varios proyectos a la vez) — de ahí projectId nullable. */
@Entity('sprints')
export class Sprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** El objetivo de la etapa en una o dos frases — lo que se quiere lograr,
   * no la lista de tareas (eso son los tickets). */
  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'varchar', default: SprintStatus.PLANNED })
  status: SprintStatus;

  /** Nullable: una etapa transversal (ej. "Identidad visual") toca varios
   * proyectos y no pertenece a uno solo. */
  @Column({ nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  /** Orden manual en el timeline cuando dos etapas se solapan en fechas.
   * Menor primero. */
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Ticket, (ticket) => ticket.sprint)
  tickets: Ticket[];
}
