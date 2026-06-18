import { IsEnum, IsOptional, IsNumber, IsString, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FichaStatus } from '../entities/ficha.entity';
import { FichaElectricaData } from '../types/ficha-electrica.types';

export class UpdateFichaDto {
  @ApiPropertyOptional({ enum: FichaStatus })
  @IsOptional()
  @IsEnum(FichaStatus)
  status?: FichaStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  data?: FichaElectricaData | Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  photos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signature?: string;
}
