import { IsEnum, IsUUID, IsOptional, IsNumber, IsString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FichaType } from '../entities/ficha.entity';
import { FichaElectricaData } from '../types/ficha-electrica.types';

export class CreateFichaDto {
  @ApiProperty({ enum: FichaType })
  @IsEnum(FichaType)
  type: FichaType;

  @ApiProperty()
  @IsUUID()
  projectId: string;

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
