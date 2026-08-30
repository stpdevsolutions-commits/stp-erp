import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, MinLength, Min, Max } from 'class-validator';

export class IndirectCostDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  pct: number;

  // `amount` es calculado server-side; se acepta pero se ignora.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  amount?: number;

  @IsOptional()
  @IsIn(['itbis'])
  kind?: 'itbis';

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  /** Solo aplica a kind='itbis'. 'gravables' (default) = base = suma de los
   * conceptos marcados taxable. 'total' = base = subtotal + todos los demás
   * gastos indirectos (o sea, ITBIS sobre la factura completa). */
  @IsOptional()
  @IsIn(['gravables', 'total'])
  baseMode?: 'gravables' | 'total';
}
