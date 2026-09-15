import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Presente SOLO en tokens de un solo propósito (ej. reset de contraseña,
   *  ver AuthService.forgotPassword). Un access token real nunca lo trae. */
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Un token de un solo propósito (reset de contraseña, etc.) no sirve como
    // sesión: firmarlo con el mismo secreto que un access token normal lo
    // hacía funcionar como Bearer token completo durante su hora de validez.
    if (payload.type) throw new UnauthorizedException('Token no válido para autenticación');
    const user = await this.usersService.findByIdOptional(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('Account disabled or not found');
    return { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName };
  }
}
