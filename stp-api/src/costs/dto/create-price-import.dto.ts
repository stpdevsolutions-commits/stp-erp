import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePriceImportDto {
  /** Proveedor al que pertenecen los precios del documento. */
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
