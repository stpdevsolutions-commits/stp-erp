import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/**
 * Guard del flujo OAuth de Google.
 *
 * - Si las credenciales de Google NO están configuradas, la estrategia 'google'
 *   no se registra (ver auth.module.ts) y AuthGuard lanzaría un 500. En su lugar
 *   redirigimos a /login con un mensaje amigable.
 * - handleRequest se sobreescribe para NO lanzar 401 cuando el usuario no está
 *   autorizado: devuelve `null`, de modo que el controller pueda redirigir a
 *   /login?error=... (en vez de mostrar un JSON de error en el navegador).
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const configured =
      !!this.config.get<string>('GOOGLE_CLIENT_ID') &&
      !!this.config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!configured) {
      const res = context.switchToHttp().getResponse<Response>();
      const appUrl = this.config.get<string>('APP_URL') ?? 'https://erp.stpsoluciones.com';
      const msg = encodeURIComponent('El inicio de sesión con Google no está disponible por ahora.');
      res.redirect(`${appUrl}/login?error=${msg}`);
      return false;
    }

    return super.canActivate(context);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<TUser = any>(_err: any, user: any): TUser {
    return (user || null) as TUser;
  }

  getAuthenticateOptions(_context: ExecutionContext) {
    // Fuerza selección de cuenta y solicita el email siempre.
    return { prompt: 'select_account' };
  }
}
