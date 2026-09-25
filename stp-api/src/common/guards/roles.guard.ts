import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.ADMIN]: 3,
  [UserRole.MANAGER]: 2,
  [UserRole.USER]: 1,
  // FINANZA no encaja en este rango lineal (ERP-83/ERP-85: su acceso real
  // lo decide module-permissions.ts, no este guard). Rango 0 a propósito:
  // en cualquier endpoint que todavía use @Roles() y no se haya migrado a
  // @RequireModule(), Finanza queda denegado por defecto en vez de heredar
  // de más por accidente.
  [UserRole.FINANZA]: 0,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    const userRank = ROLE_RANK[user.role as UserRole] ?? 0;
    const minRequired = Math.min(...required.map((r) => ROLE_RANK[r] ?? 0));
    return userRank >= minRequired;
  }
}
