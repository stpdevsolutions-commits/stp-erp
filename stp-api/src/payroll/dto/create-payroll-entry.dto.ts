import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { PayrollMethod, PayrollStatus } from '../entities/payroll-entry.entity';

export class CreatePayrollEntryDto {
  @IsUUID()
  collaboratorId: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  /**
   * Días y tarifa son opcionales para permitir un pago a suma alzada (solo bonos),
   * pero si se indican el servidor calcula el bruto con ellos. Nunca se aceptan
   * `grossAmount` ni `netAmount` del cliente.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  daysWorked?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtimeAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bonuses?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @IsOptional()
  @IsEnum(PayrollMethod)
  method?: PayrollMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
