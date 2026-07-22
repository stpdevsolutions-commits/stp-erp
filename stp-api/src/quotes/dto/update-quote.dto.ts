import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  ValidateIf,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuoteStatus } from '../entities/quote.entity';
import { CreateQuoteItemDto } from './create-quote-item.dto';
import { IndirectCostDto } from './indirect-cost.dto';

export class UpdateQuoteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items?: CreateQuoteItemDto[];

  // `null` desactiva los gastos indirectos y vuelve al ITBIS clásico (legacy).
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IndirectCostDto)
  indirectCosts?: IndirectCostDto[] | null;
}
