import { IsString, IsOptional, IsNumber, MinLength, Min, Max } from 'class-validator';

export class CreateQuoteItemDto {
  @IsString()
  @MinLength(1)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}
