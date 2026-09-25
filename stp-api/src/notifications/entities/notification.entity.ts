import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  QUOTE_APPROVED = 'quote_approved',
  QUOTE_REJECTED = 'quote_rejected',
  PAYMENT_RECEIVED = 'payment_received',
}

/**
 * Notificación in-app (ERP-107, feed de la campanita del header). Es un
 * registro de solo lectura para quien la recibe: se crea una vez desde el
 * evento que la dispara y solo se le permite marcar `read`. No reemplaza los
 * avisos existentes por correo/WhatsApp (NotificationsService/WhatsappService)
 * — conviven, cada uno es un canal distinto para el mismo evento.
 */
@Entity('notifications_inapp')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  /** Ruta del frontend a la que lleva al hacer click, si aplica. */
  @Column({ nullable: true })
  link: string;

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
