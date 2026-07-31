import { NotFoundException } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';

/**
 * Carga una entidad SIN relaciones para modificarla y guardarla.
 *
 * Es obligatorio usarla en los `update()` en vez del `findOne()` del propio
 * servicio: ese trae las relaciones (`client`, `project`, `supplier`,
 * `assignedTo`…) y, cuando el objeto de la relación está presente, TypeORM le da
 * prioridad sobre la columna FK al persistir. Resultado: `Object.assign(entity,
 * { clientId: otro })` se descartaba en silencio y el cambio de cliente, proyecto
 * o proveedor de un registro existente NO se guardaba.
 *
 * Con la entidad "pelada" solo existen las columnas, así que la FK manda.
 * Para devolver el objeto completo al cliente, recargar con `findOne()` después
 * de guardar.
 */
export async function loadForUpdate<T extends ObjectLiteral>(
  repository: Repository<T>,
  id: string,
  notFoundMessage = 'Not found',
): Promise<T> {
  const entity = await repository.findOne({
    where: { id } as never,
    loadEagerRelations: false,
  });
  if (!entity) throw new NotFoundException(notFoundMessage);
  return entity;
}
