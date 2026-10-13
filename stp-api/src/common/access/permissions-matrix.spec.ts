import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { REQUIRE_MODULE_KEY, RequireModuleMeta } from '../decorators/require-module.decorator';
import {
  MODULE_PERMISSIONS,
  ModuleKey,
  PermissionLevel,
  getModuleAccess,
  hasModuleAccess,
} from './module-permissions';
import { UserRole } from '../../users/entities/user.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

// Descubre TODOS los controladores de src/ (una ruta nueva entra sola en la prueba).
const SRC = join(__dirname, '..', '..');

function findControllers(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'migrations') continue;
      findControllers(full, out);
    } else if (name.endsWith('.controller.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface RouteInfo {
  id: string; // Clase.metodo
  verb: string;
  path: string;
  guards: unknown[];
  meta?: RequireModuleMeta;
}

const VERBS: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const file of findControllers(SRC).sort()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const ctrl = exported as { prototype: Record<string, unknown>; name: string };
      const base = Reflect.getMetadata(PATH_METADATA, ctrl);
      if (base === undefined) continue; // no es un @Controller
      const classGuards: unknown[] = Reflect.getMetadata('__guards__', ctrl) ?? [];
      const classMeta = Reflect.getMetadata(REQUIRE_MODULE_KEY, ctrl) as RequireModuleMeta | undefined;
      for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
        if (key === 'constructor') continue;
        const handler = ctrl.prototype[key];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue; // helper, no ruta
        const path = Reflect.getMetadata(PATH_METADATA, handler);
        const methodGuards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];
        const methodMeta = Reflect.getMetadata(REQUIRE_MODULE_KEY, handler) as RequireModuleMeta | undefined;
        routes.push({
          id: `${ctrl.name}.${key}`,
          verb: VERBS[method as number] ?? String(method),
          path: `/${[base, path].filter((p) => p && p !== '/').join('/')}`,
          guards: [...classGuards, ...methodGuards],
          meta: methodMeta ?? classMeta,
        });
      }
    }
  }
  return routes;
}

const ROUTES = collectRoutes();
const MODULE_KEYS: ModuleKey[] = Object.keys(MODULE_PERMISSIONS[UserRole.ADMIN]) as ModuleKey[];
const VALID_LEVELS: PermissionLevel[] = ['none', 'view', 'contribute', 'manage'];

describe('Matriz de permisos y controladores', () => {
  it('descubre controladores y rutas (sanidad de la prueba)', () => {
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES.some((r) => r.meta)).toBe(true);
  });

  describe('(a) @RequireModule usa modulos y niveles validos', () => {
    const withMeta = ROUTES.filter((r) => r.meta);

    it('todos los ModuleKey usados existen en la matriz', () => {
      const bad = withMeta.filter((r) => !MODULE_KEYS.includes(r.meta!.module)).map((r) => r.id);
      expect(bad).toEqual([]);
    });

    it('todos los niveles usados son validos y ninguno exige "none"', () => {
      const bad = withMeta
        .filter((r) => !VALID_LEVELS.includes(r.meta!.level) || r.meta!.level === 'none')
        .map((r) => `${r.id}:${r.meta!.level}`);
      expect(bad).toEqual([]);
    });

    it('todos los roles definen todos los modulos con un nivel valido', () => {
      for (const role of Object.values(UserRole)) {
        expect(Object.keys(MODULE_PERMISSIONS[role]).sort()).toEqual([...MODULE_KEYS].sort());
        for (const m of MODULE_KEYS) expect(VALID_LEVELS).toContain(MODULE_PERMISSIONS[role][m]);
      }
    });

    it('el admin tiene manage en todos los modulos', () => {
      for (const m of MODULE_KEYS) expect(getModuleAccess(UserRole.ADMIN, m)).toBe('manage');
    });

    it('rol o modulo desconocido cae en "none" (falla cerrado)', () => {
      expect(getModuleAccess('hacker', 'nomina')).toBe('none');
      expect(hasModuleAccess('hacker', 'clientes', 'view')).toBe(false);
      expect(getModuleAccess(UserRole.ADMIN, 'inexistente' as ModuleKey)).toBe('none');
    });
  });

  describe('(b) los roles no obtienen lo que la matriz les niega', () => {
    const denied: Array<[UserRole, ModuleKey[]]> = [
      [
        UserRole.USER,
        ['nomina', 'configuracion', 'facturas', 'pagos', 'gastos', 'cotizaciones', 'costos', 'proveedores', 'reportes', 'colaboradores', 'mensajes'],
      ],
      [UserRole.FINANZA, ['configuracion', 'cronograma', 'tareas', 'fichas', 'inventario', 'mensajes']],
      [UserRole.MANAGER, ['nomina', 'configuracion', 'facturas']],
    ];

    it.each(denied)('%s no tiene ni "view" en los modulos negados', (role, modules) => {
      for (const m of modules) expect({ role, m, ok: hasModuleAccess(role, m, 'view') }).toEqual({ role, m, ok: false });
    });

    it('user y finanza solo tienen manage donde la matriz lo concede', () => {
      const manageOf = (role: UserRole) => MODULE_KEYS.filter((m) => getModuleAccess(role, m) === 'manage');
      expect(manageOf(UserRole.USER)).toEqual(['tareas', 'fichas']);
      expect(manageOf(UserRole.FINANZA)).toEqual(['cotizaciones', 'pagos', 'gastos', 'nomina', 'facturas']);
    });

    it('user solo "contribuye" en archivos (sube, no borra)', () => {
      expect(getModuleAccess(UserRole.USER, 'archivos')).toBe('contribute');
      expect(hasModuleAccess(UserRole.USER, 'archivos', 'contribute')).toBe(true);
      expect(hasModuleAccess(UserRole.USER, 'archivos', 'manage')).toBe(false);
    });

    it('ninguna ruta de nomina/configuracion/facturas es alcanzable por user ni manager', () => {
      const sensitive = ROUTES.filter((r) => r.meta && ['nomina', 'configuracion', 'facturas'].includes(r.meta.module));
      const reachable: string[] = [];
      for (const r of sensitive) {
        for (const role of [UserRole.USER, UserRole.MANAGER]) {
          if (hasModuleAccess(role, r.meta!.module, r.meta!.level)) reachable.push(`${role} -> ${r.id}`);
        }
      }
      expect(reachable).toEqual([]);
    });

    it('quien solo tiene view no alcanza rutas que piden manage', () => {
      for (const r of ROUTES.filter((x) => x.meta?.level === 'manage')) {
        for (const role of Object.values(UserRole)) {
          if (getModuleAccess(role, r.meta!.module) === 'view') {
            expect(hasModuleAccess(role, r.meta!.module, 'manage')).toBe(false);
          }
        }
      }
    });
  });

  describe('(c) instantanea legible de la matriz por rol', () => {
    const snapshot = (role: UserRole) => MODULE_KEYS.map((m) => `${m}=${MODULE_PERMISSIONS[role][m]}`).join(' ');

    it('admin', () => {
      expect(snapshot(UserRole.ADMIN)).toBe(
        'clientes=manage cotizaciones=manage proyectos=manage cronograma=manage tareas=manage fichas=manage archivos=manage costos=manage proveedores=manage inventario=manage pagos=manage gastos=manage nomina=manage reportes=manage colaboradores=manage configuracion=manage facturas=manage mensajes=manage',
      );
    });
    it('manager', () => {
      expect(snapshot(UserRole.MANAGER)).toBe(
        'clientes=manage cotizaciones=manage proyectos=manage cronograma=manage tareas=manage fichas=manage archivos=manage costos=manage proveedores=manage inventario=manage pagos=view gastos=manage nomina=none reportes=view colaboradores=view configuracion=none facturas=none mensajes=manage',
      );
    });
    it('finanza', () => {
      expect(snapshot(UserRole.FINANZA)).toBe(
        'clientes=view cotizaciones=manage proyectos=view cronograma=none tareas=none fichas=none archivos=view costos=view proveedores=view inventario=none pagos=manage gastos=manage nomina=manage reportes=view colaboradores=view configuracion=none facturas=manage mensajes=none',
      );
    });
    it('user', () => {
      expect(snapshot(UserRole.USER)).toBe(
        'clientes=view cotizaciones=none proyectos=view cronograma=view tareas=manage fichas=manage archivos=contribute costos=none proveedores=none inventario=view pagos=none gastos=none nomina=none reportes=none colaboradores=none configuracion=none facturas=none mensajes=none',
      );
    });
    it('no aparecen roles nuevos sin revisar la matriz', () => {
      expect(Object.values(UserRole).sort()).toEqual(['admin', 'finanza', 'manager', 'user']);
    });
  });

  describe('rutas sin JwtAuthGuard: lista blanca', () => {
    // Rutas publicas A PROPOSITO. Una ruta nueva sin JwtAuthGuard debe agregarse aqui tras revisarla.
    const PUBLIC_ALLOWLIST = new Set<string>([
      'AuthController.register', // protegida por OpenRegistrationGuard (admin o bootstrap)
      'AuthController.login',
      'AuthController.loginWithGoogle',
      'AuthController.googleAuth',
      'AuthController.googleAuthCallback',
      'AuthController.refresh',
      'AuthController.logout',
      'AuthController.forgotPassword',
      'AuthController.resetPassword',
      // Decision publica de cotizaciones (token JWT firmado en el enlace)
      'QuotesPublicController.preview',
      'QuotesPublicController.decision',
      // Webhook de WhatsApp (Meta): verificacion + firma HMAC
      'WhatsappWebhookController.verify',
      'WhatsappWebhookController.receive',
      'HealthController.check',
      'AppController.getHello',
    ]);

    const unguarded = () => ROUTES.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id);

    it('toda ruta sin JwtAuthGuard esta en la lista blanca (una ruta nueva rompe la prueba)', () => {
      const unexpected = ROUTES.filter((r) => !r.guards.includes(JwtAuthGuard) && !PUBLIC_ALLOWLIST.has(r.id)).map(
        (r) => `${r.verb} ${r.path} (${r.id})`,
      );
      expect(unexpected).toEqual([]);
    });

    it('la lista blanca no tiene entradas obsoletas', () => {
      const stale = [...PUBLIC_ALLOWLIST].filter((id) => !unguarded().includes(id));
      expect(stale).toEqual([]);
    });

    it('ninguna ruta con @RequireModule carece de JwtAuthGuard', () => {
      const bad = ROUTES.filter((r) => r.meta && !r.guards.includes(JwtAuthGuard)).map((r) => r.id);
      expect(bad).toEqual([]);
    });
  });
});
