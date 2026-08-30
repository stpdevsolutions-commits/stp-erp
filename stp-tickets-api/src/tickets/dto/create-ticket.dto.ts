import { IsString, IsOptional, IsEnum, IsUUID, MinLength, MaxLength } from 'class-validator';
import { TicketType, TicketPriority } from '../entities/ticket.entity';

export class CreateTicketDto {
  @IsUUID()
  projectId: string;

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
}
