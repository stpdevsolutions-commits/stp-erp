import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsUUID,
  IsArray,
  IsBoolean,
  IsDateString,
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

  // ── Origen del unitario: partida de costos (ACU) ───────────────────────────
  //
  // Con `acuId` la línea deja de necesitar `unitPrice`: el servidor valora la receta
  // con los precios vigentes y CONGELA el resultado en la línea.
  //
  // Los tres campos del congelado (`acuUnitCost`, `acuPricedAt`, `acuIncomplete`) se
  // aceptan del cliente por una razón concreta: editar una cotización reemplaza el
  // árbol entero (`PATCH /quotes/:id` con `items`), así que el editor tiene que poder
  // devolver el congelado tal cual. Si vienen, se conservan; si no, el servidor congela
  // de nuevo con el costo de hoy. El unitario que se cobra sale igualmente de
  // `unitPrice`, que el cliente ya podía mandar: esto no añade superficie nueva.

  @IsOptional()
  @IsUUID()
  acuId?: string;

  /** Margen sobre el costo directo del ACU. Sin él, el unitario es el costo pelado. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  acuMarkupPct?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  acuUnitCost?: number;

  @IsOptional()
  @IsDateString()
  acuPricedAt?: string;

  @IsOptional()
  @IsBoolean()
  acuIncomplete?: boolean;

  /**
   * Permite congelar un ACU al que le falta el precio de algún material. Por defecto el
   * servidor lo RECHAZA (422): un unitario incompleto es un piso, no un precio, y
   * mandárselo a un cliente como bueno es el error caro. Con esta bandera se acepta a
   * conciencia y la línea queda marcada `acuIncomplete` para siempre.
   */
  @IsOptional()
  @IsBoolean()
  allowIncompleteAcu?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  children?: CreateQuoteItemDto[];
}
