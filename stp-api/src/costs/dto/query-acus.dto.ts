import { IsOptional, IsString, IsUUID, IsEnum, IsInt, IsBooleanString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AcuTrade } from '../entities/acu.entity';

export class QueryAcusDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(AcuTrade) trade?: AcuTrade;
  @IsOptional() @IsString() chapter?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsBooleanString() isActive?: string;
  /** Incluye el costo calculado de cada partida. Cuesta una consulta de precios más. */
  @IsOptional() @IsBooleanString() withCost?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
