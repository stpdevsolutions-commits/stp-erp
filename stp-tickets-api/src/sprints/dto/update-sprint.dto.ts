import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SprintStatus } from '../entities/sprint.entity';

export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // @IsOptional() en class-validator también deja pasar null — así se puede
  // limpiar el objetivo o desasignar el proyecto con un PATCH.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(SprintStatus)
  status?: SprintStatus;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsInt()
  position?: number;
}
