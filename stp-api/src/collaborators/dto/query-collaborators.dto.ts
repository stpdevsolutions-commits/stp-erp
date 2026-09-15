import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { clampPage, clampLimit } from '../../common/pagination';
import { CollaboratorStatus } from '../entities/collaborator.entity';

export class QueryCollaboratorsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CollaboratorStatus)
  status?: CollaboratorStatus;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
