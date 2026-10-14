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

/** Un dispositivo/navegador suscrito a Web Push (ERP-58). Un usuario puede tener varios. */
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index('IDX_push_subscriptions_userId')
  @Column({ type: 'uuid' })
  userId: string;

  /** URL del servicio de push del navegador; identifica al dispositivo y es única. */
  @Column({ type: 'text', unique: true })
  endpoint: string;

  @Column({ type: 'varchar', length: 255 })
  p256dh: string;

  @Column({ type: 'varchar', length: 255 })
  auth: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastUsedAt: Date;
}
