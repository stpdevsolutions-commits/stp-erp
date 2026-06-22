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
      { expiresIn: '15m' },
    );
    const appUrl = this.config.get<string>('APP_URL') ?? 'https://stpsoluciones.com';
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
