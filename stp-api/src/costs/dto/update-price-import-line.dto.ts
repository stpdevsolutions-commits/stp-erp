import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PriceCurrency } from '../entities/material-price.entity';
import { PriceImportLineStatus } from '../entities/price-import-line.entity';

/**
 * Correcciones de la persona que revisa. `rawDescription` y compañía NO se pueden
 * tocar: son la copia de lo que decía el PDF y sirven para auditar después.
 */
export class UpdatePriceImportLineDto {
  /** Material del catálogo al que se imputa. `null` explícito lo desasigna. */
  @IsOptional()
  @IsUUID()
  materialId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(PriceCurrency)
  currency?: PriceCurrency;

  @IsOptional()
  @IsBoolean()
  itbisIncluded?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99.99)
  discountPct?: number;

  /** Solo se puede pasar a `rejected` (descartar) o volver a `pending`. */
  @IsOptional()
  @IsEnum(PriceImportLineStatus)
  status?: PriceImportLineStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
