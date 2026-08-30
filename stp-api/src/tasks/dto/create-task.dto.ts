import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskStatus, TaskPriority } from '../entities/task.entity';

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Colaborador (empleado sin cuenta) que ejecuta la tarea. */
  @IsOptional()
  @IsUUID()
  collaboratorId?: string;

  /** Avisar por WhatsApp al colaborador asignado. Default true — false solo si se pide explícito. */
  @IsOptional()
  @IsBoolean()
  notifyCollaborator?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
