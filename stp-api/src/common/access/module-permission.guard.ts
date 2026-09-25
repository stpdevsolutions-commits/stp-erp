import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MODULE_KEY, RequireModuleMeta } from '../decorators/require-module.decorator';
import { hasModuleAccess } from './module-permissions';

/**
 * Guard de la matriz de permisos por modulo (ERP-83/ERP-85). Convive con
 * RolesGuard mientras se migran los controladores uno por uno de @Roles()
 * a @RequireModule() -- un endpoint sin @RequireModule() no se ve afectado
 * por este guard (pasa), asi que agregarlo a un controlador que todavia usa
 * @Roles() no rompe nada.
 */
@Injectable()
export class ModulePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequireModuleMeta>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    return hasModuleAccess(user.role, required.module, required.level);
  }
}
