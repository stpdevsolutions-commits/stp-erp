import { IsObject, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateMaterialCalcDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(40)
  calculatorId: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsObject()
  inputs: Record<string, unknown>;

  /**
   * Resultado calculado en la app. La forma se valida en el servicio
   * (`parseResultado`): son listas anidadas y class-validator no aporta nada
   * sobre eso que no sea ruido.
   */
  @IsObject()
  result: Record<string, unknown>;
}

export class QueryMaterialCalcsDto {
  @IsUUID()
  projectId: string;
}

export class SetCalcLinkDto {
  @IsUUID()
  materialId: string;
}

/** Claves de insumo: minúsculas, dígitos y guion bajo ("cemento_gris", "thhn_12"). */
export const CLAVE_REGEX = /^[a-z0-9_]{1,80}$/;

export class ClaveParam {
  @Matches(CLAVE_REGEX)
  clave: string;
}
