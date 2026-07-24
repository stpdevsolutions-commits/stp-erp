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
import { Project } from './project.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Pertenencia explícita de un usuario a un proyecto (muchos-a-muchos).
 * Junto con `Project.assignedToId` (pertenencia implícita del responsable)
 * define qué proyectos ve un usuario con rol USER.
 */
@Entity('project_members')
@Unique('UQ_project_members_project_user', ['projectId', 'userId'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project, {
    nullable: false,
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Index('IDX_project_members_projectId')
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index('IDX_project_members_userId')
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
