import { SetMetadata } from '@nestjs/common';
import { ModuleKey, PermissionLevel } from '../access/module-permissions';

export const REQUIRE_MODULE_KEY = 'requireModule';

export interface RequireModuleMeta {
  module: ModuleKey;
  level: PermissionLevel;
}

/**
 * Reemplaza a @Roles() en los controladores gobernados por la matriz de
 * permisos por modulo (ERP-83/ERP-85). `level` por defecto 'view' porque la
 * mayoria de los usos son en un GET; los endpoints de escritura piden
 * explicitamente 'manage'.
 */
export const RequireModule = (module: ModuleKey, level: PermissionLevel = 'view') =>
  SetMetadata(REQUIRE_MODULE_KEY, { module, level } satisfies RequireModuleMeta);
