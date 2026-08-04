import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsInt,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AcuTrade } from '../entities/acu.entity';

export class AcuItemDto {
  @IsEnum(['material', 'labor', 'equipment'])
  kind: 'material' | 'labor' | 'equipment';

  @IsOptional()
  @IsUUID()
  materialId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsEnum(['yield', 'pct_materials'])
  basis?: 'yield' | 'pct_materials';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  wastePct?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAcuDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  unitId: string;

  @IsOptional()
  @IsEnum(AcuTrade)
  trade?: AcuTrade;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  chapter?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** La receta completa. Se puede crear vacía y añadir líneas después. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcuItemDto)
  items?: AcuItemDto[];
}
