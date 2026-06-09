import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum CollaboratorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

const dec = { to: (v: number) => v, from: (v: string) => (v != null ? parseFloat(v) : 0) };

@Entity('collaborators')
export class Collaborator {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() firstName: string;
  @Column() lastName: string;
  @Column({ nullable: true }) email: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) position: string;
  @Column({ nullable: true }) cedula: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: dec }) dailyRate: number;
  @Column({ type: 'enum', enum: CollaboratorStatus, default: CollaboratorStatus.ACTIVE }) status: CollaboratorStatus;
  @Column({ type: 'text', nullable: true }) notes: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
