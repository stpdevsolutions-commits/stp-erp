import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsDateString,
  MinLength,
  Min,
} from 'class-validator';
import { ExpenseCategory } from '../entities/expense.entity';

export class UpdateExpenseDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  /**
   * Desglose opcional. `quantity` y `unitPrice` van juntos o no van; si van, el
   * servidor recalcula `amount`. Con `materialId` además se deriva un precio real de
   * compra en el módulo de costos.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  materialId?: string;

  /** Si el unitario ya trae el ITBIS dentro. */
  @IsOptional()
  @IsBoolean()
  itbisIncluded?: boolean;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
