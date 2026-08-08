import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum FileContext {
  CLIENT_PROFILE = 'client-profile',
  CLIENT_DOCUMENTS = 'client-documents',
  CLIENT_QUOTES = 'client-quotes',
  CLIENT_PAYMENTS = 'client-payments',
  PROJECT_PHOTOS = 'project-photos',
  PROJECT_DOCUMENTS = 'project-documents',
  PROJECT_EXPENSES = 'project-expenses',
  PROJECT_QUOTES = 'project-quotes',
  PROJECT_PAYMENTS = 'project-payments',
  /**
   * Informes de proyecto archivados (PDF). A diferencia del resto de contextos,
   * estos archivos NO los sube nadie: los genera el ERP al pulsar "Guardar en el
   * proyecto" en el informe. Van en su propio contexto para que no se mezclen
   * con los documentos que el equipo sube a mano.
   */
  PROJECT_REPORTS = 'project-reports',
}

@Entity('uploaded_files')
export class FileUpload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalName: string;

  @Column()
  filename: string;

  @Column()
  path: string;

  @Column()
  mimetype: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'enum', enum: FileContext })
  context: FileContext;

  @Column({ type: 'uuid' })
  clientId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;

  @Column({ type: 'uuid', nullable: true })
  uploadedById: string;

  @CreateDateColumn()
  createdAt: Date;
}
