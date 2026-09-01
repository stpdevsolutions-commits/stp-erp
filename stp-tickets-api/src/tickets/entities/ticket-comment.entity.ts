import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';

/** Historial de qué se hizo en un ticket — decisiones, contexto, avances.
 * Sin edición ni borrado a propósito: es un registro de lo que pasó, no un
 * documento editable (si algo estaba mal, se agrega un comentario nuevo
 * que lo corrija, no se reescribe la historia). */
@Entity('ticket_comments')
export class TicketComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ticketId: string;

  @ManyToOne(() => Ticket, (ticket) => ticket.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: Ticket;

  @Column({ type: 'text' })
  body: string;

  /** Texto libre: "Pedro" o "Claude" — mismo patrón que reportedBy en Ticket. */
  @Column({ default: 'Pedro' })
  author: string;

  @CreateDateColumn()
  createdAt: Date;
}
