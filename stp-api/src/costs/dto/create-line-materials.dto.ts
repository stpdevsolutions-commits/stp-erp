import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LineMaterialItemDto {
  @IsUUID()
  lineId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(250)
  name: string;

  @IsUUID()
  unitId: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

/** Crear de una vez los materiales que el catálogo no tiene, desde la cotización. */
export class CreateLineMaterialsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LineMaterialItemDto)
  items: LineMaterialItemDto[];
}
