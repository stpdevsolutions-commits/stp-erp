import { AsyncLocalStorage } from 'async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Quién está haciendo la petición actual, disponible en cualquier servicio sin pasar el usuario
 * por cada función. Lo usa la firma digital de los PDF: el documento lleva el nombre de quien lo
 * generó, no el de un usuario genérico.
 */
const storage = new AsyncLocalStorage<{ name: string }>();

/** Nombre completo del usuario autenticado en la petición en curso, o null fuera de una petición. */
export function currentActorName(): string | null {
  return storage.getStore()?.name ?? null;
}

@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<{ user?: { firstName?: string; lastName?: string; email?: string } }>().user;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email;
    if (!name) return next.handle();
    // `next.handle()` es perezoso: hay que suscribirse DENTRO de run() para que el contexto viaje con la petición.
    return new Observable((subscriber) => storage.run({ name }, () => next.handle().subscribe(subscriber)));
  }
}
