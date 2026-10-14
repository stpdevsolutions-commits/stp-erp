import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { phoneNormalizedSql } from '../../common/phone-normalized';

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  USER = 'user',
  /** Acceso definido por la matriz de permisos por modulo (ver
   *  common/access/module-permissions.ts), no por el rango de RolesGuard —
   *  ver ERP-83/ERP-85. */
  FINANZA = 'finanza',
  /** Cuenta de agente (Hermes/MCP) de SOLO LECTURA: ve Clientes y Cotizaciones y nada más.
   *  Igual que FINANZA, su acceso lo decide module-permissions.ts; rango 0 en RolesGuard. */
  READONLY = 'readonly',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  /** Para notificaciones por WhatsApp (asignación de tareas, etc.). Cualquier formato; se normaliza al enviar. */
  @Column({ type: 'varchar', nullable: true })
  phone: string;

  /** Solo dígitos con código de país; la calcula Postgres a partir de `phone` (ERP-75). No se escribe a mano. */
  @Index('IDX_users_phoneNormalized')
  @Column({ type: 'varchar', nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: phoneNormalizedSql('phone') })
  phoneNormalized: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
