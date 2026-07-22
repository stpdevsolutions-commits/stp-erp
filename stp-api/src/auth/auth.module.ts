import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { OpenRegistrationGuard } from './guards/open-registration.guard';
import { UsersModule } from '../users/users.module';
import { RefreshToken } from './entities/refresh-token.entity';

/**
 * Provider condicional de la estrategia de Google. Solo se instancia si las
 * credenciales están configuradas; de lo contrario passport-google-oauth20
 * lanzaría al arrancar la app. Sin credenciales, las rutas /auth/google
 * simplemente responden 401 (estrategia 'google' no registrada).
 */
const googleStrategyProvider = {
  provide: GoogleStrategy,
  useFactory: (config: ConfigService, authService: AuthService) => {
    if (!config.get<string>('GOOGLE_CLIENT_ID') || !config.get<string>('GOOGLE_CLIENT_SECRET')) {
      return null;
    }
    return new GoogleStrategy(config, authService);
  },
  inject: [ConfigService, AuthService],
};

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ?? '1h') as any },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, googleStrategyProvider, OpenRegistrationGuard],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
