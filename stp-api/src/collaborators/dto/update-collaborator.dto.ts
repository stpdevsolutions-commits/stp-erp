import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { CollaboratorStatus } from '../entities/collaborator.entity';

export class UpdateCollaboratorDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  cedula?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @IsEnum(CollaboratorStatus)
  status?: CollaboratorStatus;

  // `type` y `code` no son editables: el código correlativo se asigna una sola vez
  // al crear, según el tipo elegido en ese momento (ver CollaboratorsService.create).
  // Cambiar el tipo después dejaría el código desincronizado (ej. code="F-003" con
  // type="contractor"), así que un cambio de tipo real implica dar de baja y crear
  // un colaborador nuevo con su propio código.

  @IsOptional()
  @IsString()
  notes?: string;
}
