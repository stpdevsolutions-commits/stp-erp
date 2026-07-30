import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsPositive,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UnitKind } from '../entities/unit.entity';

export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

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
}
