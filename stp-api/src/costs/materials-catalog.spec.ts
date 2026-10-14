import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialCalcsController } from '../material-calcs/material-calcs.controller';
import { MaterialsService } from './materials.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ModulePermissionGuard } from '../common/access/module-permission.guard';
import { REQUIRE_MODULE_KEY } from '../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';

/** ERP-72: catálogo sin precios para el rol user; links de calculadora solo fichas:manage. */
function ctx(handler: (...a: any[]) => any, cls: any, role: UserRole): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('GET /costs/materials/catalog (ERP-72)', () => {
  const guard = new ModulePermissionGuard(new Reflector());
  const proto = MaterialsController.prototype;

  it('está declarado antes de :id y exige fichas:contribute', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('findCatalog')).toBeLessThan(names.indexOf('findOne'));
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, proto.findCatalog)).toEqual({
      module: 'fichas',
      level: 'contribute',
    });
  });

  it.each([UserRole.USER, UserRole.MANAGER, UserRole.ADMIN])('%s puede leer el catálogo', (role) => {
    expect(guard.canActivate(ctx(proto.findCatalog, MaterialsController, role))).toBe(true);
  });

  it('finanza no accede al catálogo de técnicos', () => {
    expect(guard.canActivate(ctx(proto.findCatalog, MaterialsController, 'finanza' as UserRole))).toBe(false);
  });

  it('el rol user sigue sin acceso al listado con precios', () => {
    expect(guard.canActivate(ctx(proto.findAll, MaterialsController, UserRole.USER))).toBe(false);
    expect(guard.canActivate(ctx(proto.findOne, MaterialsController, UserRole.USER))).toBe(false);
  });
});

describe('MaterialsService.findCatalog (sin precios)', () => {
  it('selecciona solo id/código/nombre/unidad/categoría y filtra activos', async () => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: '1' }], 1]),
    };
    const repo: any = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const svc = new MaterialsService(repo, {} as any, {} as any, {} as any);
    const res = await svc.findCatalog({ search: 'thhn', limit: 8 } as any);

    const selected: string[] = qb.select.mock.calls[0][0];
    expect(selected).toEqual(['m.id', 'm.code', 'm.name', 'unit.code', 'unit.name', 'category.id', 'category.name']);
    expect(selected.join(' ')).not.toMatch(/price|cost|margin|supplier|notes|specs|brand/i);
    expect(qb.where).toHaveBeenCalledWith('m.isActive = true');
    expect(res).toEqual({ data: [{ id: '1' }], total: 1, page: 1, limit: 8 });
  });
});

describe('PUT/DELETE /material-calcs/links', () => {
  const guard = new ModulePermissionGuard(new Reflector());
  const proto = MaterialCalcsController.prototype;

  it('la clase exige fichas:manage y los handlers no lo relajan', () => {
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, MaterialCalcsController)).toEqual({
      module: 'fichas',
      level: 'manage',
    });
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, proto.setLink)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, proto.deleteLink)).toBeUndefined();
  });

  it('finanza queda fuera; admin dentro', () => {
    for (const h of [proto.setLink, proto.deleteLink]) {
      expect(guard.canActivate(ctx(h, MaterialCalcsController, 'finanza' as UserRole))).toBe(false);
      expect(guard.canActivate(ctx(h, MaterialCalcsController, UserRole.ADMIN))).toBe(true);
    }
  });

  it('solo admin y manager modifican vínculos; user y finanza reciben 403', () => {
    const roles = new RolesGuard(new Reflector());
    for (const h of [proto.setLink, proto.deleteLink]) {
      expect(Reflect.getMetadata(ROLES_KEY, h)).toEqual([UserRole.ADMIN, UserRole.MANAGER]);
      expect(roles.canActivate(ctx(h, MaterialCalcsController, UserRole.ADMIN))).toBe(true);
      expect(roles.canActivate(ctx(h, MaterialCalcsController, UserRole.MANAGER))).toBe(true);
      expect(roles.canActivate(ctx(h, MaterialCalcsController, UserRole.USER))).toBe(false);
      expect(roles.canActivate(ctx(h, MaterialCalcsController, 'finanza' as UserRole))).toBe(false);
    }
  });

  it('user sigue leyendo: GET links no lleva @Roles y pasa ambos guards', () => {
    const roles = new RolesGuard(new Reflector());
    expect(Reflect.getMetadata(ROLES_KEY, proto.getLinks)).toBeUndefined();
    const c = ctx(proto.getLinks, MaterialCalcsController, UserRole.USER);
    expect(roles.canActivate(c)).toBe(true);
    expect(guard.canActivate(c)).toBe(true);
  });
});
