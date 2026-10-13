import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';

/** Etapas del pipeline de ventas (ERP-57). */
export enum LeadStage {
  NEW = 'new',
  QUALIFYING = 'qualifying',
  VISIT_PENDING = 'visit_pending',
  VISIT_DONE = 'visit_done',
  QUOTE_SENT = 'quote_sent',
  WON = 'won',
  LOST = 'lost',
}

/**
 * Persona o empresa que escribe al WhatsApp de negocio: el lead y, si ya es cliente, su enlace con
 * el ERP. Una fila por número (teléfono normalizado: solo dígitos con código de país).
 */
@Entity('wa_contacts')
export class WaContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  /** Nombre del perfil de WhatsApp o el que se le ponga a mano. */
  @Column({ type: 'varchar', nullable: true })
  name: string;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Index('IDX_wa_contacts_clientId')
  @Column({ type: 'uuid', nullable: true })
  clientId: string;

  @Column({ type: 'enum', enum: LeadStage, default: LeadStage.NEW })
  stage: LeadStage;

  /** Servicio de interés, texto libre (presión constante, cámaras, ...). */
  @Column({ type: 'varchar', nullable: true })
  service: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User;

  @Index('IDX_wa_contacts_assignedToId')
  @Column({ type: 'uuid', nullable: true })
  assignedToId: string;

  /** Último mensaje del contacto: define la ventana de 24 h para escribir texto libre. */
  @Column({ type: 'timestamptz', nullable: true })
  lastInboundAt: Date;

  @Index('IDX_wa_contacts_lastMessageAt')
  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'varchar', nullable: true })
  lastMessagePreview: string;

  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  /** El último mensaje es del contacto y nadie del equipo ha contestado. */
  @Column({ default: false })
  awaitingReply: boolean;

  /** Último aviso por Telegram de mensaje nuevo, para no avisar por cada mensaje seguido. */
  @Column({ type: 'timestamptz', nullable: true })
  lastAlertAt: Date;

  /** Cuándo se avisó de que lleva demasiado sin atender (se limpia al contestar). */
  @Column({ type: 'timestamptz', nullable: true })
  escalatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
