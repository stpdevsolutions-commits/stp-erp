import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Generated,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { TicketComment } from './ticket-comment.entity';

export enum TicketType {
  BUG = 'bug',
  MEJORA = 'mejora',
  CAMBIO = 'cambio',
  DESARROLLO = 'desarrollo',
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

  /** Número correlativo GLOBAL ("#7") — se mantiene por compatibilidad y
   * como referencia cronológica absoluta, pero ya no es el identificador
   * principal que se muestra: eso es el código (ver projectNumber). */
  @Column({ unique: true })
  @Generated('increment')
  number: number;

  /** Número correlativo DENTRO del proyecto (FRD-1, FRD-2...) — este es el
   * identificador que se muestra. Se asigna en TicketsService.create con un
   * UPDATE atómico sobre Project.nextTicketNumber, nunca con @Generated,
   * porque necesita reiniciar en 1 por cada proyecto, no ser global. Null si
   * el ticket no tiene proyecto (ver projectId) — en ese caso se muestra el
   * número global (number) en su lugar. */
  @Column({ type: 'int', nullable: true })
  projectNumber: number | null;

  /** Nullable a propósito: un ticket de tipo "desarrollo" puede reportar un
   * sistema que todavía no existe como proyecto — no tiene sentido forzar
   * a elegir uno de la lista. */
  @Column({ nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, (project) => project.tickets, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

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

  /** Texto libre también — quién lo está trabajando. Sin sistema de
   * usuarios real, así que no hay nada que validar contra una tabla. */
  @Column({ type: 'varchar', nullable: true })
  assignedTo: string;

  @Column({ type: 'date', nullable: true })
  resolvedAt: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TicketComment, (comment) => comment.ticket)
  comments: TicketComment[];
}
