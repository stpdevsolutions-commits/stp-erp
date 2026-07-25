import type {
  AccessSubject,
  ResourceScope,
} from '../common/access/access-policy';

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  ÁMBITO DE ACCESO DE UNA TAREA
 * ────────────────────────────────────────────────────────────────────────────
 *  `decideAccess()` (common/access/access-policy.ts) es el único sitio donde se
 *  decide. Aquí solo se TRADUCE una tarea al `ResourceScope` que esa función
 *  entiende. No hay reglas nuevas: se reutilizan las existentes.
 *
 *  Dos matices propios de tareas:
 *
 *  1. `ResourceKind` no contempla `'task'` (y common/ no es modificable desde
 *     este módulo), así que se declara el ámbito como `'project'`: una tarea es,
 *     a efectos de pertenencia, un recurso colgado de su proyecto. `decideAccess`
 *     solo trata `'client'` de forma especial, de modo que el resultado es
 *     idéntico al que daría un hipotético `kind: 'task'`.
 *
 *  2. Una tarea tiene DOS usuarios "dueños" (`createdById` y `assignedToId`),
 *     mientras que `ResourceScope.ownerId` es uno solo. Se resuelve eligiendo el
 *     que corresponde al sujeto de la petición: si la tarea está asignada a
 *     quien pregunta, ese es el `ownerId`; si no, lo es su creador. Así ambos
 *     conservan acceso a su propio trabajo sin tocar la política ni el esquema.
 */
export interface TaskAccessFields {
  projectId?: string | null;
  /** Cliente dueño del proyecto de la tarea (task.project.clientId). */
  clientId?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
}

export function taskResourceScope(
  task: TaskAccessFields,
  subject?: AccessSubject | null,
): ResourceScope {
  const ownerId =
    subject && task.assignedToId && task.assignedToId === subject.id
      ? task.assignedToId
      : (task.createdById ?? null);

  return {
    kind: 'project',
    clientId: task.clientId ?? null,
    projectId: task.projectId ?? null,
    ownerId,
  };
}
