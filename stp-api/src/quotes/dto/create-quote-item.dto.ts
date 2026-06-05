import { IsString, IsOptional, IsNumber, MinLength, Min } from 'class-validator';

export class CreateQuoteItemDto {
  @IsString()
  @MinLength(2)
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
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}
