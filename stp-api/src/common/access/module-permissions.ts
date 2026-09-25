import { UserRole } from '../../users/entities/user.entity';

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  PERMISOS POR MODULO — matriz rol x modulo, ERP-83/ERP-85.
 * ────────────────────────────────────────────────────────────────────────────
 * Complementa, no reemplaza, a access-policy.ts: esto decide que MODULOS
 * puede ver/gestionar cada rol; access-policy.ts sigue decidiendo, para el
 * rol `user`, a cuales REGISTROS especificos dentro de esos modulos tiene
 * acceso (por pertenencia a cliente/proyecto). Admin/Manager/Finanza no
 * pasan por esa pertenencia salvo la excepcion de Gastos anotada abajo.
 *
 * Por que una constante en codigo y no una tabla editable desde la UI: son
 * 4 roles fijos, no un sistema abierto de roles por definir en runtime — un
 * panel de administracion de permisos es un problema aparte (y un vector de
 * error/privilegio si se hace mal) que no se justifica todavia. Si algun dia
 * hace falta, es un ticket propio.
 *
 * Matriz confirmada por Pedro 2026-09-20 (ver comentario en ERP-83).
 */

export type ModuleKey =
  | 'clientes'
  | 'cotizaciones'
  | 'proyectos'
  | 'cronograma'
  | 'tareas'
  | 'fichas'
  | 'archivos'
  | 'costos'
  | 'proveedores'
  | 'inventario'
  | 'pagos'
  | 'gastos'
  | 'nomina'
  | 'reportes'
  | 'colaboradores'
  | 'configuracion';

/**
 * 'contribute' (ERP-109): ve y crea, pero no administra/borra lo de otros —
 * a medio camino entre 'view' y 'manage'. Nace puntualmente para Archivos:
 * `user` puede subir (matriz: "Ver/Subir") sin heredar el 'manage' que
 * también habilita borrar cualquier archivo del proyecto. Ningún otro modulo
 * lo usa todavia; si hace falta la misma distincion en otro, este nivel ya
 * esta disponible.
 */
export type PermissionLevel = 'none' | 'view' | 'contribute' | 'manage';

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  contribute: 2,
  manage: 3,
};

/**
 * NOTA sobre Gastos + Manager (ERP-108, resuelto): la matriz dice
 * "Registrar (solo sus proyectos)" — manage a nivel de modulo, acotado por
 * proyecto. El acotamiento vive en access-policy.ts / AccessControlService
 * (resourceKind 'expense', ver expenses.controller.ts); aqui manager sigue
 * en 'manage' a nivel de modulo a proposito, el filtro es por registro.
 */
export const MODULE_PERMISSIONS: Record<UserRole, Record<ModuleKey, PermissionLevel>> = {
  [UserRole.ADMIN]: {
    clientes: 'manage', cotizaciones: 'manage', proyectos: 'manage', cronograma: 'manage',
    tareas: 'manage', fichas: 'manage', archivos: 'manage', costos: 'manage',
    proveedores: 'manage', inventario: 'manage', pagos: 'manage', gastos: 'manage',
    nomina: 'manage', reportes: 'manage', colaboradores: 'manage', configuracion: 'manage',
  },
  [UserRole.MANAGER]: {
    clientes: 'manage', cotizaciones: 'manage', proyectos: 'manage', cronograma: 'manage',
    tareas: 'manage', fichas: 'manage', archivos: 'manage', costos: 'manage',
    proveedores: 'manage', inventario: 'manage', pagos: 'view', gastos: 'manage',
    nomina: 'none', reportes: 'view', colaboradores: 'view', configuracion: 'none',
  },
  [UserRole.FINANZA]: {
    clientes: 'view', cotizaciones: 'manage', proyectos: 'view', cronograma: 'none',
    tareas: 'none', fichas: 'none', archivos: 'view', costos: 'view',
    proveedores: 'view', inventario: 'none', pagos: 'manage', gastos: 'manage',
    nomina: 'manage', reportes: 'view', colaboradores: 'view', configuracion: 'none',
  },
  [UserRole.USER]: {
    // 'view'/'manage' aqui solo habilita el modulo -- que registros ve
    // dentro de el sigue filtrado por pertenencia (access-policy.ts).
    // archivos: 'contribute', no 'manage' (ERP-109) -- puede subir pero no
    // borrar archivos de otros; el endpoint de borrado sigue pidiendo 'manage'.
    clientes: 'view', cotizaciones: 'none', proyectos: 'view', cronograma: 'view',
    tareas: 'manage', fichas: 'manage', archivos: 'contribute', costos: 'none',
    proveedores: 'none', inventario: 'view', pagos: 'none', gastos: 'none',
    nomina: 'none', reportes: 'none', colaboradores: 'none', configuracion: 'none',
  },
};

export function getModuleAccess(role: UserRole | string, module: ModuleKey): PermissionLevel {
  return MODULE_PERMISSIONS[role as UserRole]?.[module] ?? 'none';
}

export function hasModuleAccess(
  role: UserRole | string,
  module: ModuleKey,
  required: PermissionLevel,
): boolean {
  return LEVEL_RANK[getModuleAccess(role, module)] >= LEVEL_RANK[required];
}
