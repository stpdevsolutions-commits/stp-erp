import { IsOptional, IsString, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { clampPage, clampLimit } from '../../common/pagination';
import { PayrollPaymentType, PayrollStatus } from '../entities/payroll-entry.entity';

export class QueryPayrollDto {
  /** Busca por número (NOM-…), nombre o cédula del colaborador. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  collaboratorId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @IsOptional()
  @IsEnum(PayrollPaymentType)
  paymentType?: PayrollPaymentType;

  /** Filtran por período trabajado (solapamiento), no por fecha de pago. */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => clampPage(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => clampLimit(value))
  limit?: number = 20;
}
