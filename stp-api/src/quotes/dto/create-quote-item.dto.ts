import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsUUID,
  IsArray,
  ValidateNested,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Nodo del árbol de partidas. Es recursivo: una partida puede contener
 * subpartidas y estas, líneas (ver `quote-tree.ts`).
 *
 * `quantity` y `unitPrice` son opcionales porque un grupo no los tiene; que una
 * LÍNEA sí los traiga se exige en el servicio, donde ya se sabe si el nodo es
 * grupo (tiene hijos) o no. La profundidad y el número total de nodos también se
 * limitan allí.
 */
export class CreateQuoteItemDto {
  @IsOptional()
  @IsIn(['group', 'item'])
  kind?: 'group' | 'item';

  @IsString()
  @MinLength(1)
  description: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPct?: number;

  /**
   * Solo lo usa `POST /quotes/:id/items`, que añade un nodo suelto: indica bajo
   * qué partida colgarlo. Dentro de `children` el padre ya es implícito.
   */
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  children?: CreateQuoteItemDto[];
}
