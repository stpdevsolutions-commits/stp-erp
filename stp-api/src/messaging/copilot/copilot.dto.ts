import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class SendSuggestionDto {
  /** Texto editado por la persona; si falta se envía la respuesta propuesta tal cual. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;
}

export class SimulateMessageDto {
  @IsIn(['cliente', 'equipo'])
  from: 'cliente' | 'equipo';

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;
}

export class SimulateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SimulateMessageDto)
  messages: SimulateMessageDto[];

  @IsOptional()
  @IsBoolean()
  clienteExistente?: boolean;

  @IsOptional()
  @IsBoolean()
  primerContacto?: boolean;

  @IsOptional()
  @IsBoolean()
  horarioLaboral?: boolean;

  @IsOptional()
  @IsIn(['text', 'audio', 'image', 'video', 'document', 'location', 'sticker'])
  tipoUltimoMensaje?: string;
}
