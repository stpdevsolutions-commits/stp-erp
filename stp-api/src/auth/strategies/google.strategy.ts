import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

/**
 * Estrategia OAuth2/OIDC de Google (nombre passport: 'google').
 *
 * Solo se instancia si GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET /
 * GOOGLE_CALLBACK_URL están configurados (ver auth.module.ts). De lo contrario
 * passport-google-oauth20 lanzaría al arrancar la app.
 *
 * `validate` NO decide la política de acceso: delega en
 * AuthService.validateGoogleUser (lista de dominios/usuarios permitidos).
 * Nunca lanza excepción aquí; devuelve `false` con un mensaje para que el
 * controller pueda redirigir a /login con un error amigable
 * (ver GoogleOAuthGuard.handleRequest).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const emailEntry = profile.emails?.[0];
      const session = await this.authService.validateGoogleUser({
        email: emailEntry?.value,
        emailVerified: String(emailEntry?.verified) === 'true',
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
      });
      // Pasamos a la request la respuesta de sesión ya construida
      // (access_token + refresh_token + user) para que el controller
      // solo tenga que setear cookies y redirigir.
      done(null, session);
    } catch (err) {
      done(null, false, { message: (err as Error).message });
    }
  }
}
