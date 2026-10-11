import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { clampLimit, clampPage } from '../../common/pagination';
import { PaymentMethod } from '../../payments/entities/payment.entity';
import { ITBIS_RATES } from '../sales-invoice-rules';

export class SalesInvoiceLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string | null;

  /** Antes de ITBIS. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsIn([...ITBIS_RATES])
  itbisRate: number;

  @IsOptional()
  @IsIn([1, 2])
  goodOrService?: number;
}

export class CreateSalesInvoiceDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Si viene sin `lines`, las líneas salen de la cotización (ver `quotePercent`). */
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  /** Porción de la cotización que cubre la factura (1–100). Por defecto, toda. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  quotePercent?: number;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceLineDto)
  lines?: SalesInvoiceLineDto[];
}

export class UpdateSalesInvoiceDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceLineDto)
  lines?: SalesInvoiceLineDto[];
}

export class CreateCreditNoteDto {
  /** `full` anula la factura completa; `partial` acredita un monto (corrige montos). */
  @IsIn(['full', 'partial'])
  mode: 'full' | 'partial';

  /** Motivo, hasta 90 caracteres (lo exige el e-CF). */
  @IsString()
  @MinLength(3)
  @MaxLength(90)
  reason: string;

  /** Solo en `partial`: monto a acreditar, antes de ITBIS. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  /** Solo en `partial`: tasa de ITBIS del monto (18, 16 o 0 = exento). Por defecto 18. */
  @IsOptional()
  @IsIn([...ITBIS_RATES])
  itbisRate?: number;
}

export class PreviewFromQuoteDto {
  @IsUUID()
  quoteId: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percent?: number;
}

export class EmitSalesInvoiceDto {
  /** Enviar a la DGII al emitir. Sin marcar, queda firmado pero sin transmitir. */
  @IsOptional()
  @IsBoolean()
  transmitir?: boolean;
}

export class AddInvoicePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ApplyPaymentDto {
  @IsUUID()
  paymentId: string;
}

export class QuerySalesInvoicesDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() quoteId?: string;

  @IsOptional()
  @IsIn(['draft', 'issued'])
  status?: 'draft' | 'issued';

  /** Estado de cobro de las emitidas. */
  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid', 'overdue', 'void'])
  payment?: 'unpaid' | 'partial' | 'paid' | 'overdue' | 'void';

  /** Facturas o notas de crédito. */
  @IsOptional()
  @IsIn(['invoice', 'credit_note'])
  kind?: 'invoice' | 'credit_note';

  /** Estado del e-CF (Aceptado, Firmado, Rechazado…). */
  @IsOptional() @IsString() @MaxLength(50) ecfEstado?: string;

  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
