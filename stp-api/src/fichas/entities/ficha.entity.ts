import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { FichaElectricaData } from '../types/ficha-electrica.types';

export enum FichaType {
  ELECTRICO = 'electrico',
  CIVIL = 'civil',
  ELECTROMECANICO = 'electromecanico',
  LEVANTAMIENTO = 'levantamiento',
  EVALUACION_DANOS = 'evaluacion_danos',
  DOMOTICA = 'domotica',
}

export enum FichaStatus {
  BORRADOR = 'borrador',
  EN_PROGRESO = 'en_progreso',
  ENVIADA = 'enviada',
}

@Entity('fichas')
export class Ficha {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'enum', enum: FichaType })
  type: FichaType;

  @Column({ type: 'enum', enum: FichaStatus, default: FichaStatus.BORRADOR })
  status: FichaStatus;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'technicianId' })
  technician: User;

  @Column({ type: 'uuid' })
  technicianId: string;

  @Column({ type: 'jsonb', default: {} })
  data: FichaElectricaData | Record<string, unknown>;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: { to: (v: number) => v, from: (v: string) => (v != null ? parseFloat(v) : null) } })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: { to: (v: number) => v, from: (v: string) => (v != null ? parseFloat(v) : null) } })
  longitude: number;

  @Column({ type: 'simple-array', nullable: true, default: null })
  photos: string[];

  @Column({ type: 'text', nullable: true })
  signature: string;

  @Column({ nullable: true })
  submittedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
