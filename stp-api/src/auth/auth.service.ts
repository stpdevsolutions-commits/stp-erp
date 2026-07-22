import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

const REFRESH_TOKEN_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async register(email: string, password: string, firstName: string, lastName: string) {
    const user = await this.usersService.create(email, password, firstName, lastName);
    return this.buildResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) throw new UnauthorizedException('Account disabled');
    return this.buildResponse(user);
  }

  async loginWithGoogle(accessToken: string) {
    const res = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${accessToken}`);
    if (!res.ok) throw new UnauthorizedException('Token de Google inválido');
    const info = (await res.json()) as {
      email?: string;
      verified_email?: boolean;
      given_name?: string;
      family_name?: string;
    };
    // Aplica la MISMA política que el flujo OAuth por redirección: no
    // auto-crea cuentas arbitrarias; solo emails ya registrados o de un
    // dominio permitido (ver validateGoogleUser).
    return this.validateGoogleUser({
      email: info.email,
      emailVerified: info.verified_email === true,
      firstName: info.given_name,
      lastName: info.family_name,
    });
  }

  /**
   * Punto único de decisión para el acceso vía Google (tanto el flujo OAuth
   * por redirección `GET /auth/google/callback` como el flujo por accessToken
   * `POST /auth/google`).
   *
   * Política (ERP interno — ver README de la tarea):
   *  1. El email debe venir verificado por Google.
   *  2. Si el usuario ya existe y está activo → inicia sesión.
   *  3. Si NO existe:
   *       - Se auto-crea (rol USER) SOLO si su dominio está en
   *         GOOGLE_ALLOWED_DOMAINS **y** GOOGLE_AUTO_PROVISION=true.
   *       - En cualquier otro caso se rechaza (no se crean cuentas arbitrarias).
   *  4. Si existe pero está deshabilitado → se rechaza.
   *
   * Emite el MISMO JWT (7 días) y refresh token que el login normal.
   */
  async validateGoogleUser(profile: {
    email?: string;
    emailVerified?: boolean;
    firstName?: string;
    lastName?: string;
  }) {
    const email = profile.email?.toLowerCase().trim();
    if (!email) {
      throw new UnauthorizedException('No se pudo obtener el correo desde Google');
    }
    if (profile.emailVerified === false) {
      throw new UnauthorizedException('El correo de Google no está verificado');
    }

    let user = await this.usersService.findByEmail(email);

    if (!user) {
      if (!this.isDomainAllowed(email) || !this.autoProvisionEnabled()) {
        throw new UnauthorizedException(
          'Tu cuenta de Google no está autorizada para acceder al sistema. Contacta al administrador.',
        );
      }
      // Auto-aprovisionamiento controlado: rol USER (mínimo privilegio, RBAC).
      user = await this.usersService.create(
        email,
        randomBytes(32).toString('hex'), // password aleatorio inutilizable (login solo por Google)
        profile.firstName || email.split('@')[0],
        profile.lastName || '',
      );
    }

    if (!user.isActive) throw new UnauthorizedException('Account disabled');
    return this.buildResponse(user);
  }

  private isDomainAllowed(email: string): boolean {
    const raw = this.config.get<string>('GOOGLE_ALLOWED_DOMAINS');
    if (!raw) return false; // vacío = ningún dominio (seguro por defecto)
    const allowed = raw
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    // Comodín explícito: '*' permite cualquier dominio (el gate real es la VPN).
    if (allowed.includes('*')) return true;
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    return allowed.includes(domain);
  }

  private autoProvisionEnabled(): boolean {
    return this.config.get<string>('GOOGLE_AUTO_PROVISION') === 'true';
  }

  async refresh(rawToken: string) {
    const hash = this.hashToken(rawToken);
    const rt = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash, revoked: false },
      relations: { user: true },
    });

    if (!rt || rt.expiresAt < new Date()) {
      if (rt) {
        rt.revoked = true;
        await this.refreshTokenRepo.save(rt);
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!rt.user || !rt.user.isActive) {
      throw new UnauthorizedException('Account disabled');
    }

    // Token rotation: revoke the used token and issue a new pair
    rt.revoked = true;
    await this.refreshTokenRepo.save(rt);

    return this.buildResponse(rt.user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) return;

    const token = this.jwtService.sign(
      { sub: user.id, type: 'password-reset' },
      { expiresIn: '1h' },
    );
    const appUrl = this.config.get<string>('APP_URL') ?? 'https://erp.stpsoluciones.com';
    this.notifications.sendPasswordReset({
      email: user.email,
      firstName: user.firstName,
      resetUrl: `${appUrl}/reset-password?token=${token}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(token) as { sub: string; type: string };
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (payload.type !== 'password-reset') throw new UnauthorizedException('Token inválido');
    await this.usersService.updatePassword(payload.sub, newPassword);
  }

  async logout(rawToken: string): Promise<void> {
    const hash = this.hashToken(rawToken);
    await this.refreshTokenRepo.update({ tokenHash: hash }, { revoked: true });
  }

  private async buildResponse(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = await this.issueRefreshToken(user.id);
    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    const rt = this.refreshTokenRepo.create({
      tokenHash: this.hashToken(raw),
      userId,
      expiresAt,
    });
    await this.refreshTokenRepo.save(rt);
    return raw;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
