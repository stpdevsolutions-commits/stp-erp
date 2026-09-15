import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Antes `updateCompany` recibía `Partial<CompanyData>` (un tipo, no una clase): sin
 * decoradores, el ValidationPipe global (`whitelist: true`) no tenía nada que
 * validar ni qué claves recortar. `SettingsService.setCompanyData` iteraba
 * `Object.keys(data)` confiando en que solo traía campos de `CompanyData` — con esto
 * cualquier clave adicional en el body terminaba guardada tal cual como
 * `company_<clave>` en la tabla de settings.
 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  rnc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  phones?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  website?: string;
}
