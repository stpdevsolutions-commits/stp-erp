import 'reflect-metadata';
import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../users/entities/user.entity';
import { MODULE_PERMISSIONS, ModuleKey, getModuleAccess, hasModuleAccess } from './module-permissions';
import { ModulePermissionGuard } from './module-permission.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { REQUIRE_MODULE_KEY, RequireModuleMeta } from '../decorators/require-module.decorator';
import { hasUnrestrictedAccess } from './access-policy';
import { QuotesController } from '../../quotes/quotes.controller';
import { ClientsController } from '../../clients/clients.controller';
import { ReportsController } from '../../reports/reports.controller';
import { ProjectReportController } from '../../reports/project-report.controller';
import { UsersController } from '../../users/users.controller';

const R = UserRole.READONLY;
const ALL = Object.keys(MODULE_PERMISSIONS[UserRole.ADMIN]) as ModuleKey[];

function ctxFor(controller: any, handlerName: string, role: string | null): ExecutionContext {
  return {
    getHandler: () => controller.prototype[handlerName],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { id: 'u', role } : undefined }) }),
  } as unknown as ExecutionContext;
}

function routesOf(controller: any) {
  const out: { name: string; verb: number }[] = [];
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    const verb = Reflect.getMetadata(METHOD_METADATA, controller.prototype[name]);
    if (verb !== undefined) out.push({ name, verb });
  }
  return out;
}

describe('Rol readonly (agente de solo lectura, INF-15)', () => {
  it('el valor del enum es "readonly"', () => {
    expect(R).toBe('readonly');
  });

  describe('matriz de permisos', () => {
    it('clientes y cotizaciones = view', () => {
      expect(getModuleAccess(R, 'clientes')).toBe('view');
      expect(getModuleAccess(R, 'cotizaciones')).toBe('view');
    });
    it('todo lo demas = none', () => {
      for (const m of ALL.filter((x) => x !== 'clientes' && x !== 'cotizaciones')) {
        expect({ m, lvl: getModuleAccess(R, m) }).toEqual({ m, lvl: 'none' });
      }
    });
    it('nunca alcanza contribute ni manage en ningun modulo', () => {
      for (const m of ALL) {
        expect(hasModuleAccess(R, m, 'contribute')).toBe(false);
        expect(hasModuleAccess(R, m, 'manage')).toBe(false);
      }
    });
    it('no accede ni a ver nomina, facturas, gastos, pagos, configuracion, costos...', () => {
      for (const m of ['nomina', 'facturas', 'gastos', 'pagos', 'configuracion', 'costos', 'reportes', 'mensajes', 'colaboradores'] as ModuleKey[]) {
        expect(hasModuleAccess(R, m, 'view')).toBe(false);
      }
    });
  });

  describe('ModulePermissionGuard sobre los controladores reales', () => {
    const guard = new ModulePermissionGuard(new Reflector());
    const rolesGuard = new RolesGuard(new Reflector());
    const allow = (c: any, h: string) => guard.canActivate(ctxFor(c, h, R));
    // Pasa de verdad solo si lo deja pasar el guard de modulo Y el de roles (@Roles explicito).
    const passes = (c: any, h: string) => allow(c, h) && rolesGuard.canActivate(ctxFor(c, h, R));

    it('puede leer clientes y cotizaciones (los GET que usa el MCP)', () => {
      expect(allow(ClientsController, 'findAll')).toBe(true);
      expect(allow(ClientsController, 'findOne')).toBe(true);
      expect(allow(QuotesController, 'findAll')).toBe(true);
      expect(allow(QuotesController, 'findOne')).toBe(true);
    });

    it('NINGUNA ruta de escritura de cotizaciones o clientes lo deja pasar', () => {
      const WRITE = [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE];
      const leaks: string[] = [];
      let revisadas = 0;
      for (const c of [QuotesController, ClientsController]) {
        for (const r of routesOf(c).filter((x) => WRITE.includes(x.verb))) {
          revisadas++;
          if (passes(c, r.name)) leaks.push(`${c.name}.${r.name}`);
        }
      }
      expect(revisadas).toBeGreaterThan(10);
      expect(leaks).toEqual([]);
    });

    it('lecturas sensibles de cotizaciones exigen manage (costos ACU, pdf-file)', () => {
      expect(allow(QuotesController, 'acuDrift')).toBe(false);
      expect(allow(QuotesController, 'getPdfFile')).toBe(false);
    });

    it('rnc-lookup (consulta externa a la DGII) queda fuera', () => {
      const names = routesOf(ClientsController).map((r) => r.name);
      const lookup = names.find((n) => /rnc/i.test(n));
      expect(lookup).toBeDefined();
      expect(allow(ClientsController, lookup!)).toBe(false);
    });

    it('dashboard, analytics e informes de proyecto estan cerrados (readonly es "unrestricted" en alcance)', () => {
      expect(allow(ReportsController, 'getDashboard')).toBe(false);
      expect(allow(ReportsController, 'getAnalytics')).toBe(false);
      for (const h of ['getInforme', 'saveInforme', 'archivarInforme', 'exportInforme']) {
        expect(allow(ProjectReportController, h)).toBe(false);
      }
    });

    it('los demas roles conservan dashboard/analytics/informes (sin regresion)', () => {
      for (const role of [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANZA, UserRole.USER]) {
        expect(guard.canActivate(ctxFor(ReportsController, 'getDashboard', role))).toBe(true);
        expect(guard.canActivate(ctxFor(ReportsController, 'getAnalytics', role))).toBe(true);
        expect(guard.canActivate(ctxFor(ProjectReportController, 'getInforme', role))).toBe(true);
      }
    });

    it('cotizaciones: sin regresion para admin/manager/finanza (escrituras) y user sigue fuera', () => {
      for (const role of [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANZA]) {
        expect(guard.canActivate(ctxFor(QuotesController, 'create', role))).toBe(true);
        expect(guard.canActivate(ctxFor(QuotesController, 'update', role))).toBe(true);
        expect(guard.canActivate(ctxFor(QuotesController, 'acuDrift', role))).toBe(true);
      }
      expect(guard.canActivate(ctxFor(QuotesController, 'findAll', UserRole.USER))).toBe(false);
    });

    it('sin usuario, deniega', () => {
      expect(guard.canActivate(ctxFor(QuotesController, 'findAll', null))).toBe(false);
    });
  });

  describe('toda ruta de quotes/clients con metadato: lo alcanzable por readonly son solo GET', () => {
    it('recorre los controladores', () => {
      const rg = new RolesGuard(new Reflector());
      const reachable: string[] = [];
      for (const c of [QuotesController, ClientsController]) {
        for (const r of routesOf(c)) {
          const meta: RequireModuleMeta | undefined =
            Reflect.getMetadata(REQUIRE_MODULE_KEY, (c as any).prototype[r.name]) ??
            Reflect.getMetadata(REQUIRE_MODULE_KEY, c);
          if (meta && hasModuleAccess(R, meta.module, meta.level) && rg.canActivate(ctxFor(c, r.name, R))) {
            reachable.push(`${r.verb === RequestMethod.GET ? 'GET' : 'ESCRITURA'} ${c.name}.${r.name}`);
          }
        }
      }
      expect(reachable.filter((x) => x.startsWith('ESCRITURA'))).toEqual([]);
      expect(reachable.length).toBeGreaterThan(0);
    });
  });

  describe('RolesGuard (jerarquia)', () => {
    const rg = new RolesGuard(new Reflector());
    class Dummy {
      @Roles(UserRole.USER) soloUser() {}
      @Roles(UserRole.MANAGER) soloManager() {}
      @Roles(UserRole.ADMIN) soloAdmin() {}
    }
    it('readonly no supera ni iguala a user, manager ni admin', () => {
      for (const h of ['soloUser', 'soloManager', 'soloAdmin']) {
        expect(rg.canActivate(ctxFor(Dummy, h, R))).toBe(false);
      }
    });
    it('las rutas de usuarios solo-admin lo rechazan', () => {
      for (const h of ['create', 'findAll', 'findOne']) {
        expect(rg.canActivate(ctxFor(UsersController, h, R))).toBe(false);
      }
    });
  });

  describe('alcance de registros', () => {
    it('readonly ve todos los clientes/cotizaciones (sin pertenencia)', () => {
      expect(hasUnrestrictedAccess(R)).toBe(true);
    });
  });
});
