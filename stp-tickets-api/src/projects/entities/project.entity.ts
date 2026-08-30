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

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Ticket, (ticket) => ticket.project)
  tickets: Ticket[];
}
