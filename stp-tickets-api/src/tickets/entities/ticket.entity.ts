import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Generated,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

export enum TicketType {
  BUG = 'bug',
  MEJORA = 'mejora',
  CAMBIO = 'cambio',
}

/** Mismo vocabulario que TaskStatus en stp-erp — un solo idioma de estados
 * en todos los sistemas de STP. */
export enum TicketStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Número correlativo simple ("#7") para poder referirse a un ticket sin
   * usar el UUID — independiente del id, autogenerado por Postgres (SERIAL). */
  @Column({ unique: true })
  @Generated('increment')
  number: number;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, (project) => project.tickets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', default: TicketType.MEJORA })
  type: TicketType;

  @Column({ type: 'varchar', default: TicketStatus.PENDING })
  status: TicketStatus;

  @Column({ type: 'varchar', default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  /** Texto libre: "Pedro" o "Claude" — no hay sistema de usuarios, es solo
   * para saber quién lo reportó a simple vista. */
  @Column({ default: 'Pedro' })
  reportedBy: string;

  @Column({ type: 'date', nullable: true })
  resolvedAt: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
