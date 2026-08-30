import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Secreto compartido máquina-a-máquina (no es una cuenta de usuario) — mismo
 * patrón que LOCAL_AGENT_KEY en Vigía. Protege los endpoints de escritura;
 * las lecturas quedan abiertas porque el servicio ya está gateado por red
 * (Caddy remote_ip para la web, acceso directo solo vía SSH/docker interno).
 */
@Injectable()
export class AgentKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-agent-key'];
    const expected = this.config.get<string>('TICKETS_AGENT_KEY');
    if (!expected || key !== expected) {
      throw new UnauthorizedException('x-agent-key inválida o ausente');
    }
    return true;
  }
}
