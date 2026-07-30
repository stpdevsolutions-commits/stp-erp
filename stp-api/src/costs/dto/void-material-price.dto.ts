import { IsString, MinLength, MaxLength } from 'class-validator';

export class VoidMaterialPriceDto {
  /**
   * Obligatorio: un precio anulado sin motivo deja el historial imposible de auditar
   * ("¿esto era un error de dedo o cambió el mercado?").
   */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
