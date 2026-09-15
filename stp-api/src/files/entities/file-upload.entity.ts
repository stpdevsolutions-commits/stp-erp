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
   * Informes de proyecto archivados (PDF), tipo CLIENTE. A diferencia del resto de
   * contextos, estos archivos NO los sube nadie: los genera el ERP al pulsar "Guardar
   * en el proyecto" en el informe. Van en su propio contexto para que no se mezclen
   * con los documentos que el equipo sube a mano.
   */
  PROJECT_REPORTS = 'project-reports',
  /**
   * Igual que PROJECT_REPORTS pero para el informe INTERNO (incluye nómina y
   * márgenes). Contexto propio, y no una bandera aparte, para que la descarga
   * (`FilesController.download`) pueda exigir MANAGER/ADMIN mirando solo el
   * contexto — antes de esto ambos tipos compartían PROJECT_REPORTS y cualquier
   * miembro del proyecto podía descargar el interno vía /files/:id/download,
   * aunque el módulo de informes se lo negara por cualquier otra vía.
   */
  PROJECT_REPORTS_INTERNAL = 'project-reports-internal',
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
