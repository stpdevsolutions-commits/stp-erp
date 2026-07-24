import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Client } from './client.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Pertenencia explícita de un usuario a un cliente (muchos-a-muchos).
 * Da acceso a TODO lo del cliente: sus proyectos, cotizaciones, pagos,
 * gastos y archivos (incluidos los documentos a nivel de cliente).
 */
@Entity('client_members')
@Unique('UQ_client_members_client_user', ['clientId', 'userId'])
export class ClientMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, {
    nullable: false,
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Index('IDX_client_members_clientId')
  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index('IDX_client_members_userId')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;
}
