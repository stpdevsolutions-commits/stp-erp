import { IsOptional, IsEnum, IsUUID } from 'class-validator';
import { TicketType, TicketStatus, TicketPriority } from '../entities/ticket.entity';

export class QueryTicketsDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
