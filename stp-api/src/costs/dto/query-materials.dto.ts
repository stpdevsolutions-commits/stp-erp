import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { clampPage, clampLimit } from '../../common/pagination';

export class QueryMaterialsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  /** Incluye el resumen de precios de cada material (una consulta agregada extra). */
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  withPrices?: boolean;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
