import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AcuTrade } from '../entities/acu.entity';

/**
 * `items` no está aquí a propósito: la receta se edita por sus propios endpoints
 * (`POST/PATCH/DELETE /costs/acus/:id/items`). Un PATCH que aceptara el array entero
 * obligaría a decidir si reemplaza o fusiona, y ambas respuestas sorprenden a alguien.
 */
export class UpdateAcuDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
