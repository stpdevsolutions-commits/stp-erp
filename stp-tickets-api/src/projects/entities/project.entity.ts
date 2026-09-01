import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Ticket } from '../../tickets/entities/ticket.entity';

/** Catálogo liviano de referencia — no es "el" proyecto real, solo su nombre
 * para poder agrupar tickets. Se siembra solo una vez al arrancar (ver
 * ProjectsService.seedIfEmpty en main.ts) con los proyectos que ya lleva STP. */
@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  /** Prefijo corto para los códigos de ticket (ej. "FRD" -> FRD-1, FRD-2...). */
  @Column({ unique: true })
  code: string;

  /** Siguiente número a asignar dentro de ESTE proyecto — no es un id, es el
   * correlativo humano (FRD-1, FRD-2...). Se incrementa con un UPDATE
   * atómico (ver TicketsService.create), nunca leyendo y sumando aparte,
   * para no pisarse si dos tickets del mismo proyecto se crean a la vez. */
  @Column({ type: 'int', default: 1 })
  nextTicketNumber: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Ticket, (ticket) => ticket.project)
  tickets: Ticket[];
}
