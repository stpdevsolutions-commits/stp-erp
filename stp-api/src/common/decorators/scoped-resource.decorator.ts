import { SetMetadata } from '@nestjs/common';
import { ResourceKind } from '../access/access-policy';

export const SCOPED_RESOURCE_KEY = 'scoped_resource';

export interface ScopedResourceDescriptor {
  /** Tipo de recurso a resolver. */
  kind: ResourceKind;
  /** Nombre del parámetro que trae el id. Por defecto `id`. */
  param?: string;
  /** Dónde buscar el valor. Por defecto: params → query → body. */
  in?: 'param' | 'query' | 'body';
  /**
   * Solo para `kind: 'client'`: exige pertenencia explícita al cliente
   * (no basta con ser miembro de uno de sus proyectos).
   */
  strict?: boolean;
  /** Si el valor no viene en la petición, no comprobar nada (por defecto false). */
  optional?: boolean;
}

/**
 * Marca una ruta como acotada por pertenencia a cliente/proyecto.
 * `ResourceAccessGuard` la hace cumplir; sin este decorador la ruta NO está
 * protegida por pertenencia (solo por rol), y eso se ve leyendo el controlador.
 *
 *   @ScopedResource('file')                                  // param :id
 *   @ScopedResource({ kind: 'client', param: 'clientId' })
 */
export const ScopedResource = (
  ...resources: (ResourceKind | ScopedResourceDescriptor)[]
) =>
  SetMetadata(
    SCOPED_RESOURCE_KEY,
    resources.map<ScopedResourceDescriptor>((r) =>
      typeof r === 'string' ? { kind: r } : r,
    ),
  );
