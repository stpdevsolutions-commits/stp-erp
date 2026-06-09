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

  @IsOptional()
  @IsString()
  notes?: string;
}
