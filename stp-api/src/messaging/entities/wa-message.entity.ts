import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { WaContact } from './wa-contact.entity';
import { User } from '../../users/entities/user.entity';

export enum MessageDirection {
  IN = 'in',
  OUT = 'out',
}

/** Estados de un mensaje saliente según los avisos de Meta, más 'received' para los entrantes. */
export type MessageStatus = 'received' | 'sent' | 'delivered' | 'read' | 'failed';

@Entity('wa_messages')
@Index('IDX_wa_messages_contact_sentAt', ['contactId', 'sentAt'])
export class WaMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WaContact, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'contactId' })
  contact: WaContact;

  @Column({ type: 'uuid' })
  contactId: string;

  /** Id del mensaje en Meta (wamid). Único: Meta reintenta entregas y así no se duplican. */
  @Column({ type: 'varchar', nullable: true, unique: true })
  waId: string;

  @Column({ type: 'enum', enum: MessageDirection })
  direction: MessageDirection;

  /** text, image, document, audio, video, location, interactive, template, ... */
  @Column({ default: 'text' })
  type: string;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({ type: 'varchar', nullable: true })
  mediaId: string;

  /** Ruta relativa dentro de /app/uploads del adjunto ya descargado (los enlaces de Meta caducan). */
  @Column({ type: 'varchar', nullable: true })
  mediaPath: string;

  @Column({ type: 'varchar', nullable: true })
  mime: string;

  @Column({ type: 'varchar', nullable: true })
  filename: string;

  @Column({ default: 'received' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'varchar', nullable: true })
  templateName: string;

  /** Usuario del ERP que lo escribió (nulo en entrantes y en respuestas automáticas). */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'sentById' })
  sentBy: User;

  @Column({ type: 'uuid', nullable: true })
  sentById: string;

  /** Hora real del mensaje (la de Meta para los entrantes). */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
