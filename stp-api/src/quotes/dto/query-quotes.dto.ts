import { IsOptional, IsString, IsEnum, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { clampPage, clampLimit } from '../../common/pagination';
import { QuoteStatus } from '../entities/quote.entity';

export class QueryQuotesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Incluir también las revisiones reemplazadas (por defecto solo la vigente). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeSuperseded?: boolean;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
