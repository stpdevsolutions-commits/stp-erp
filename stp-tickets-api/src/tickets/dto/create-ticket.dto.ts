import { IsString, IsOptional, IsEnum, IsUUID, MinLength, MaxLength } from 'class-validator';
import { TicketType, TicketPriority } from '../entities/ticket.entity';

export class CreateTicketDto {
  /** Opcional: un ticket de tipo "desarrollo" puede reportar un sistema
   * nuevo que aún no existe en la lista de proyectos. */
  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Opcional: la etapa/sprint a la que entra este ticket. La mayoría de
   * tickets del día a día no llevan etapa. */
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TicketType)
  type: TicketType;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  reportedBy?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
