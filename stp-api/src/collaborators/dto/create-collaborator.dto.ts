import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { CollaboratorStatus, CollaboratorType } from '../entities/collaborator.entity';

export class CreateCollaboratorDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

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

  @IsOptional()
  @IsEnum(CollaboratorType)
  type?: CollaboratorType;

  @IsOptional()
  @IsString()
  notes?: string;
}
