import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsPositive,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UnitKind } from '../entities/unit.entity';

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(UnitKind)
  kind?: UnitKind;

  @IsOptional()
  @IsUUID()
  baseUnitId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  factor?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
