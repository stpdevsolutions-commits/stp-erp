import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FichaType, FichaStatus } from '../entities/ficha.entity';

export class QueryFichasDto {
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
}
