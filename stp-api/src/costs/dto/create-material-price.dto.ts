import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { PriceCurrency, PriceRegion, PriceSource } from '../entities/material-price.entity';

export class CreateMaterialPriceDto {
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsEnum(PriceCurrency)
  currency?: PriceCurrency;

  /** DOP por unidad de moneda. Obligatorio si `currency` no es DOP (lo valida el service). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsBoolean()
  itbisIncluded?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  itbisRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99.99)
  discountPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsEnum(PriceRegion)
  region?: PriceRegion;

  /** Fecha de vigencia (la del documento). Si se omite, hoy. */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsEnum(PriceSource)
  source?: PriceSource;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
