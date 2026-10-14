import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FichaType, FichaStatus } from '../entities/ficha.entity';

export class QueryFichasDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @ApiPropertyOptional({ enum: FichaType })
  @IsOptional()
  @IsEnum(FichaType)
  type?: FichaType;

  @ApiPropertyOptional({ enum: FichaStatus })
  @IsOptional()
  @IsEnum(FichaStatus)
  status?: FichaStatus;

  /**
   * Paginación opcional (ERP-73). Si NO se manda ni `page` ni `limit` la respuesta es la de
   * siempre (todas las fichas), para no romper a los clientes existentes (web y app).
   * Con cualquiera de los dos se devuelve esa página y el total va en `X-Total-Count`.
   */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
