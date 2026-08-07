import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Lo ÚNICO que se puede editar de un informe: textos, secciones libres,
 * conceptos añadidos a mano y las casillas de incluir/excluir bloques.
 *
 * No hay —ni puede haber— campos para gastos, cobros, balance ni porcentajes:
 * esas cifras se recalculan en cada impresión desde la base de datos. Si un
 * número está mal, se corrige el gasto o el pago de origen.
 */

export class ProjectReportSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(20000)
  body: string;
}

export class ProjectReportManualItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(300)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class ProjectReportIncludeDto {
  @IsOptional() @IsBoolean() detalleGastos?: boolean;
  @IsOptional() @IsBoolean() nomina?: boolean;
  @IsOptional() @IsBoolean() tareas?: boolean;
  @IsOptional() @IsBoolean() fichas?: boolean;
  @IsOptional() @IsBoolean() fotos?: boolean;
  @IsOptional() @IsBoolean() cronologia?: boolean;
  @IsOptional() @IsBoolean() conceptosManuales?: boolean;
}

export class UpdateProjectReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  observations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  conclusions?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProjectReportSectionDto)
  sections?: ProjectReportSectionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProjectReportManualItemDto)
  manualItems?: ProjectReportManualItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectReportIncludeDto)
  include?: ProjectReportIncludeDto;
}
