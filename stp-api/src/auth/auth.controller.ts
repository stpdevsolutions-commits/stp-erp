import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { OpenRegistrationGuard } from './guards/open-registration.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface AuthUser { id: string; email: string; role: string }

interface SessionResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(OpenRegistrationGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.firstName, dto.lastName);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  loginWithGoogle(@Body('accessToken') accessToken: string) {
    return this.authService.loginWithGoogle(accessToken);
  }

  /**
   * Inicio del flujo OAuth por redirección. El GoogleAuthGuard redirige el
   * navegador a la pantalla de consentimiento de Google. No ejecuta cuerpo.
   */
  @Get('google')
  @ApiExcludeEndpoint()
  @UseGuards(GoogleAuthGuard)
  googleAuth(): void {
    // El guard hace la redirección a Google.
  }

  /**
   * Callback de Google. El GoogleAuthGuard valida el código, ejecuta la
   * estrategia (que aplica la política de acceso) y deja en `req.user` la
   * sesión ya construida (o null si no está autorizado). Aquí seteamos las
   * MISMAS cookies que el login normal y redirigimos al dashboard.
   */
  @Get('google/callback')
  @ApiExcludeEndpoint()
  @UseGuards(GoogleAuthGuard)
  googleAuthCallback(@Req() req: Request, @Res() res: Response): void {
    const session = req.user as SessionResponse | null;
    const appUrl = this.config.get<string>('APP_URL') ?? 'https://erp.stpsoluciones.com';

    if (!session) {
      const msg = encodeURIComponent('No autorizado para acceder con esa cuenta de Google');
      res.redirect(`${appUrl}/login?error=${msg}`);
      return;
    }

    this.setAuthCookies(res, session);
    res.redirect(`${appUrl}/dashboard`);
  }

  /**
   * Setea las mismas 4 cookies que app/api/auth/login/route.ts del frontend,
   * para que proxy.ts y el resto del sistema funcionen igual.
   * (express res.cookie usa maxAge en milisegundos.)
   */
  private setAuthCookies(res: Response, session: SessionResponse): void {
    const secure = this.config.get<string>('COOKIE_SECURE') === 'true';
    const domain = this.config.get<string>('COOKIE_DOMAIN') || undefined;
    const base = { secure, sameSite: 'lax' as const, path: '/', domain };
    const DAY = 24 * 60 * 60 * 1000;

    res.cookie('stp-token', session.access_token, { ...base, httpOnly: true, maxAge: 7 * DAY });
    res.cookie('stp-refresh-token', session.refresh_token, { ...base, httpOnly: true, maxAge: 30 * DAY });
    res.cookie('stp-user', JSON.stringify(session.user), { ...base, httpOnly: false, maxAge: 7 * DAY });
    res.cookie('stp-last-activity', String(Date.now()), { ...base, httpOnly: false, maxAge: 30 * DAY });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refresh_token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  profile(@CurrentUser() user: AuthUser) {
    return user;
  }
}
