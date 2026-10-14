import { of, lastValueFrom, Observable } from 'rxjs';
import { ActorContextInterceptor, currentActorName } from './actor-context';

/** Contexto de ejecución mínimo con `request.user`. */
const ctx = (user?: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

/** Handler que, al suscribirse, anota qué actor ve el código "aguas abajo". */
function handlerSeeing(seen: Array<string | null>) {
  return {
    handle: () =>
      new Observable<string>((sub) => {
        seen.push(currentActorName());
        sub.next('ok');
        sub.complete();
      }),
  } as never;
}

describe('actor-context (firma digital: quién hace la petición)', () => {
  const interceptor = new ActorContextInterceptor();

  it('fuera de una petición no hay actor', () => {
    expect(currentActorName()).toBeNull();
  });

  it('dentro de la petición expone "Nombre Apellido" del usuario autenticado', async () => {
    const seen: Array<string | null> = [];
    const out = await lastValueFrom(
      interceptor.intercept(ctx({ firstName: 'Ana', lastName: 'Pérez', email: 'a@x.com' }), handlerSeeing(seen)),
    );
    expect(out).toBe('ok');
    expect(seen).toEqual(['Ana Pérez']);
  });

  it('con solo nombre (sin apellido) no deja espacios sobrantes', async () => {
    const seen: Array<string | null> = [];
    await lastValueFrom(interceptor.intercept(ctx({ firstName: 'Ana', email: 'a@x.com' }), handlerSeeing(seen)));
    expect(seen).toEqual(['Ana']);
  });

  it('sin nombre ni apellido usa el correo', async () => {
    const seen: Array<string | null> = [];
    await lastValueFrom(interceptor.intercept(ctx({ email: 'a@x.com' }), handlerSeeing(seen)));
    expect(seen).toEqual(['a@x.com']);
  });

  it('sin usuario (ruta pública) no abre contexto y el handler corre igual', async () => {
    const seen: Array<string | null> = [];
    await lastValueFrom(interceptor.intercept(ctx(undefined), handlerSeeing(seen)));
    expect(seen).toEqual([null]);
  });

  it('el contexto no se filtra al terminar la petición', async () => {
    await lastValueFrom(interceptor.intercept(ctx({ firstName: 'Ana' }), { handle: () => of(1) } as never));
    expect(currentActorName()).toBeNull();
  });

  it('el contexto viaja a través de código asíncrono y peticiones concurrentes no se mezclan', async () => {
    const run = (name: string, delay: number) =>
      lastValueFrom(
        interceptor.intercept(ctx({ firstName: name }), {
          handle: () =>
            new Observable<string | null>((sub) => {
              setTimeout(() => {
                sub.next(currentActorName());
                sub.complete();
              }, delay);
            }),
        } as never),
      );
    const [a, b] = await Promise.all([run('Ana', 20), run('Beto', 5)]);
    expect(a).toBe('Ana');
    expect(b).toBe('Beto');
  });
});
