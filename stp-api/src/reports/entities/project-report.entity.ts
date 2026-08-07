import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Los dos informes que se emiten por proyecto.
 *
 * `INTERNAL` es para la casa: gastos, nómina, balance y margen.
 * `CLIENT` es el documento que se entrega al cliente: avance, tareas, fichas,
 * fotos y cronología de cobros. Que sean dos tipos distintos —y no un flag
 * "mostrar economía"— es a propósito: el informe de cliente se CONSTRUYE sin
 * consultar gastos ni nómina, así que no hay ningún camino por el que el margen
 * pueda acabar dentro del PDF que se entrega.
 */
export enum ProjectReportType {
  INTERNAL = 'internal',
  CLIENT = 'client',
}

/** Sección de texto libre añadida por el usuario. */
export interface ProjectReportSection {
  id: string;
  title: string;
  body: string;
}

/**
 * Concepto añadido a mano. NO es una cifra calculada: se suma aparte y se
 * imprime en su propia tabla, rotulada como tal, para que nadie confunda un
 * apunte manual con lo que dice la base de datos.
 */
export interface ProjectReportManualItem {
  id: string;
  description: string;
  amount: number;
  notes?: string;
}

/** Casillas de incluir/excluir bloques. */
export interface ProjectReportInclude {
  /** Interno: detalle línea a línea de los gastos (además del resumen por categoría). */
  detalleGastos: boolean;
  /** Interno: desglose de la nómina imputada al proyecto. */
  nomina: boolean;
  /** Ambos: tareas. */
  tareas: boolean;
  /** Cliente: fichas técnicas del proyecto. */
  fichas: boolean;
  /** Cliente: registro fotográfico. */
  fotos: boolean;
  /** Ambos: cronología de cobros recibidos. */
  cronologia: boolean;
  /** Ambos: tabla de conceptos añadidos a mano. */
  conceptosManuales: boolean;
}

/**
 * Parte EDITABLE de un informe de proyecto — una fila por proyecto × tipo.
 *
 * Aquí solo vive lo que escribe una persona (títulos, textos, casillas y
 * conceptos manuales). Las cifras calculadas —gastos, cobros, balance, % de
 * presupuesto— NO se guardan nunca aquí: salen de la base de datos en cada
 * impresión. Si un número está mal, se corrige el gasto o el pago de origen, no
 * el informe.
 */
@Entity('project_reports')
@Index('UQ_project_reports_project_type', ['projectId', 'type'], { unique: true })
export class ProjectReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'enum', enum: ProjectReportType })
  type: ProjectReportType;

  @Column({ type: 'varchar', nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  intro: string;

  @Column({ type: 'text', nullable: true })
  observations: string;

  @Column({ type: 'text', nullable: true })
  conclusions: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  sections: ProjectReportSection[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  manualItems: ProjectReportManualItem[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  include: Partial<ProjectReportInclude>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'updatedById' })
  updatedBy: User;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
