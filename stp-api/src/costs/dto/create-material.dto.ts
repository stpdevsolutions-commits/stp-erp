import {
  IsString,
  IsOptional,
  IsUUID,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsUUID()
  unitId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  notes?: string;
}
