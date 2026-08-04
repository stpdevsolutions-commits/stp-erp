import { IsOptional, IsArray, IsUUID, IsBoolean } from 'class-validator';

/**
 * Vuelve a congelar el unitario de las líneas que vienen de un ACU, con los costos de
 * HOY. Es una acción explícita y nunca automática: el aviso de desfase
 * (`GET /quotes/:id/acu-drift`) informa, esto decide.
 */
export class RefreshAcuPricesDto {
  /**
   * Líneas a re-congelar. Si no se manda, se re-congelan TODAS las de la cotización que
   * vengan de un ACU. Se pide explícito cuando se quiere actualizar solo una parte.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  /**
   * Aceptar un ACU al que le falta el precio de algún material. Por defecto esas líneas
   * se SALTAN (no se rompe la operación por ellas) y salen listadas en `skipped`.
   */
  @IsOptional()
  @IsBoolean()
  allowIncomplete?: boolean;

  /**
   * Conservar el unitario escrito a mano después de congelar. Por defecto esas líneas
   * también se saltan: pisar sin avisar un precio que alguien puso a propósito sería
   * peor que dejarlo desfasado.
   */
  @IsOptional()
  @IsBoolean()
  overrideManual?: boolean;
}
