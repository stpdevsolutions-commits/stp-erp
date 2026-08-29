import { IsString, IsOptional, MinLength, MaxLength, IsEnum, IsBoolean, Matches } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  /** Cualquier formato razonable ("809-537-6566", "+18095376566", etc.) — se normaliza a E.164 al enviar por WhatsApp. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-() .]{7,20}$/, { message: 'phone debe ser un número de teléfono válido' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
