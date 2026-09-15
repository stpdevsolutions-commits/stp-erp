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

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Único porque es un hash de 40 bytes aleatorios (colisión prácticamente
   * imposible) y porque `refresh()`/`logout()` buscan por esta columna en CADA
   * refresco de sesión de CADA usuario — sin índice era un escaneo completo de
   * la tabla, que además nunca se depuraba (ver SchedulerService.cleanupRefreshTokens).
   */
  @Index({ unique: true })
  @Column({ length: 64 })
  tokenHash: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
