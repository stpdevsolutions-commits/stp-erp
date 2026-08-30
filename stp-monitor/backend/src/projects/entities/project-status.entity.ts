import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export type ProjectLocation = 'local' | 'server';

/**
 * Estado de un repo, sea del servidor (Vigía lo calcula solo cada minuto,
 * corriendo git dentro del contenedor) o de una máquina local (un agente en
 * esa PC lo reporta por POST /projects/report cada 15-30 min — Vigía no puede
 * ver un disco que no sea el suyo propio).
 *
 * Clave primaria compuesta `location:id` para que el mismo proyecto (ej.
 * "mi-dia") pueda tener una fila server y otra local sin pisarse.
 */
@Entity('project_statuses')
export class ProjectStatus {
  @PrimaryColumn()
  key: string; // `${location}:${id}`

  @Column()
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  location: ProjectLocation;

  @Column()
  path: string;

  @Column({ nullable: true })
  branch: string;

  @Column({ default: 0 })
  ahead: number;

  @Column({ default: 0 })
  behind: number;

  @Column({ default: 0 })
  dirtyFiles: number;

  @Column({ nullable: true })
  lastCommitHash: string;

  @Column({ type: 'text', nullable: true })
  lastCommitMessage: string;

  @Column({ nullable: true })
  lastCommitDate: string;

  /** Si el último git status falló (repo no encontrado, sin permisos, etc.). */
  @Column({ type: 'text', nullable: true })
  error: string;

  @UpdateDateColumn()
  reportedAt: Date;
}
