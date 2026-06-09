import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/entities/user.entity';

@Injectable()
export class OpenRegistrationGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow first user bootstrap when no users exist
    const userCount = await this.usersService.count();
    if (userCount === 0) return true;

    // Subsequent registrations require an authenticated ADMIN
    const request = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (!token) throw new ForbiddenException('Registration requires ADMIN authentication');

    try {
      const payload = this.jwtService.verify<{ role: string }>(token, {
        secret: this.configService.getOrThrow('JWT_SECRET'),
      });
      if (payload.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only admins can register new users');
      }
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Registration requires ADMIN authentication');
    }
  }
}
