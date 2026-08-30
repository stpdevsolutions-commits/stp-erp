import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectsService, LocalProjectReport } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getAll() {
    return this.projects.getAll();
  }

  /**
   * El agente local (PowerShell, en cada PC) manda su lista de repos aquí.
   * Protegido con una clave compartida — no es una cuenta de usuario, es un
   * secreto de máquina a máquina (ver LOCAL_AGENT_KEY en .env).
   */
  @Post('report')
  report(@Headers('x-agent-key') key: string, @Body() body: { projects: LocalProjectReport[] }) {
    const expected = this.config.get<string>('LOCAL_AGENT_KEY');
    if (!expected || key !== expected) {
      throw new UnauthorizedException('x-agent-key inválida o ausente');
    }
    return this.projects.reportLocal(body?.projects ?? []);
  }
}
