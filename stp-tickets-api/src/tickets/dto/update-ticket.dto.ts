import { IsString, IsOptional, IsEnum, IsUUID, MinLength, MaxLength } from 'class-validator';
import { TicketType, TicketStatus, TicketPriority } from '../entities/ticket.entity';

export class UpdateTicketDto {
  // @IsOptional() en class-validator también deja pasar null, no solo
  // undefined — así se puede desasignar el proyecto de un ticket (PATCH con
  // projectId: null) sin que @IsUUID() lo rechace.
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  assignedTo?: string | null;
}
