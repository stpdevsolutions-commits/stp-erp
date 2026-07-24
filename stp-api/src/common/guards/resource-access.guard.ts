import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  SCOPED_RESOURCE_KEY,
  ScopedResourceDescriptor,
} from '../decorators/scoped-resource.decorator';
import { AccessControlService } from '../access/access-control.service';
import { AccessSubject, hasUnrestrictedAccess } from '../access/access-policy';

/**
 * Hace cumplir la pertenencia a cliente/proyecto en las rutas marcadas con
 * `@ScopedResource(...)`. Debe ir SIEMPRE después de `JwtAuthGuard`:
 *
 *   @UseGuards(JwtAuthGuard, ResourceAccessGuard)
 *
 * Deniega con 404 (no 403) para no revelar la existencia del recurso.
 */
@Injectable()
export class ResourceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const descriptors = this.reflector.getAllAndOverride<
      ScopedResourceDescriptor[]
    >(SCOPED_RESOURCE_KEY, [context.getHandler(), context.getClass()]);
    if (!descriptors || descriptors.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessSubject }>();
    const user = req.user;
    if (!user) throw new NotFoundException('Recurso no encontrado');

    // ADMIN/MANAGER pasan por el mismo mecanismo, sin consultar nada.
    if (hasUnrestrictedAccess(user.role)) return true;

    for (const descriptor of descriptors) {
      const value = this.readValue(req, descriptor);
      if (!value) {
        if (descriptor.optional) continue;
        throw new NotFoundException('Recurso no encontrado');
      }
      await this.access.assertResourceAccess(
        user,
        descriptor.kind,
        value,
        descriptor.strict ?? false,
      );
    }

    return true;
  }

  private readValue(
    req: Request & { user?: AccessSubject },
    descriptor: ScopedResourceDescriptor,
  ): string | null {
    const name = descriptor.param ?? 'id';
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sources: Record<string, unknown>[] =
      descriptor.in === 'param'
        ? [req.params]
        : descriptor.in === 'query'
          ? [req.query]
          : descriptor.in === 'body'
            ? [body]
            : [req.params, req.query, body];

    for (const source of sources) {
      const raw = source?.[name];
      if (typeof raw === 'string' && raw.length > 0) return raw;
    }
    return null;
  }
}
