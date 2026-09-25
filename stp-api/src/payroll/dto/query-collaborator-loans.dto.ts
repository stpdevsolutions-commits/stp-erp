import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { clampPage, clampLimit } from '../../common/pagination';
import { CollaboratorLoanStatus } from '../entities/collaborator-loan.entity';

export class QueryCollaboratorLoansDto {
  @IsOptional()
  @IsUUID()
  collaboratorId?: string;

  @IsOptional()
  @IsEnum(CollaboratorLoanStatus)
  status?: CollaboratorLoanStatus;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
