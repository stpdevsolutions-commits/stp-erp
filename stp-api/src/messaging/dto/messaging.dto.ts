import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LeadStage } from '../entities/wa-contact.entity';

export class QueryContactsDto {
  /** queue = sin dueño · mine = las mías · waiting = esperan respuesta · all = todas */
  @IsOptional()
  @IsIn(['queue', 'mine', 'waiting', 'all'])
  filter?: 'queue' | 'mine' | 'waiting' | 'all';

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class QueryMessagesDto {
  /** Trae los mensajes anteriores a esta fecha ISO (para cargar más historial). */
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class SendTextDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}

export class SendTemplateDto {
  @IsString()
  name: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  params: string[];
}

export class UpdateContactDto {
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  /** null = dejar sin dueño (vuelve a la cola). */
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;

  /** null = quitar el enlace con el cliente del ERP. */
  @IsOptional()
  @IsUUID()
  clientId?: string | null;
}
