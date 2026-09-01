import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug solo minúsculas, números y guiones' })
  slug: string;

  @IsString()
  @MinLength(2)
  name: string;

  /** Prefijo corto para los códigos de ticket (ej. "FRD" -> FRD-1, FRD-2...). */
  @IsString()
  @MinLength(2)
  @MaxLength(6)
  @Matches(/^[A-Z0-9]+$/, { message: 'code solo mayúsculas y números' })
  code: string;
}
