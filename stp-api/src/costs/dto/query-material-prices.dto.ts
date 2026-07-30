import { IsOptional, IsUUID, IsEnum, IsBoolean, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PriceRegion, PriceSource } from '../entities/material-price.entity';

export class QueryMaterialPricesDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsEnum(PriceRegion)
  region?: PriceRegion;

  @IsOptional()
  @IsEnum(PriceSource)
  source?: PriceSource;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Por defecto los anulados NO se devuelven; `true` los incluye para auditar. */
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeVoided?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 50)
  limit?: number = 50;
}
