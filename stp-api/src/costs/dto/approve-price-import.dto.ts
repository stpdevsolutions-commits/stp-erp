import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { MAX_LINES } from '../price-extraction';

export class ApprovePriceImportDto {
  /** Líneas a convertir en precios. Se aprueba explícitamente, nunca "todas" por defecto. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_LINES)
  @IsUUID('4', { each: true })
  lineIds: string[];

  /**
   * Fecha de vigencia de los precios. Si se omite se usa la del documento, y si el
   * documento no traía fecha, la de hoy.
   */
  @IsOptional()
  @IsDateString()
  date?: string;
}
