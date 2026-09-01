import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import simpleGit from 'simple-git';
import { ProjectStatus, ProjectLocation } from './entities/project-status.entity';
import { PROJECT_META, ProjectMeta } from './project-meta';

interface ServerProjectDef {
  id: string;
  name: string;
  /** Ruta DENTRO del contenedor (ver volúmenes de solo lectura en docker-compose.yml). */
  path: string;
}

/**
 * Repos del servidor que Vigía puede leer directamente (montados de solo
 * lectura). Para agregar uno nuevo: montar su carpeta en docker-compose.yml
 * bajo /repos/<algo> y sumarlo aquí.
 */
const SERVER_PROJECTS: ServerProjectDef[] = [
  { id: 'stp-erp', name: 'STP ERP', path: '/repos/stp' },
  { id: 'stp-mobile', name: 'STP Técnicos (móvil)', path: '/repos/stp/stp-mobile' },
  { id: 'ecf-saas', name: 'eCF-SaaS', path: '/repos/ecf-saas' },
  { id: 'mi-dia', name: 'Mi Día', path: '/repos/mi-dia' },
  { id: 'estructuralrd', name: 'EstrucCalc RD Pro', path: '/data/estructuralrd' },
  { id: 'hermes-agent', name: 'Hermes Agent (asistente personal)', path: '/repos/hermes-agent' },
  { id: 'stp-tickets-app', name: 'STP Tickets', path: '/repos/stp' },
  { id: 'fantasy-nba-assistant', name: 'Fantasy NBA Assistant', path: '/repos/fantasy-nba-assistant' },
];

/** Reporte que manda el agente local (ver scripts/local-agent en el repo). */
export interface LocalProjectReport {
  id: string;
  name: string;
  path: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  dirtyFiles?: number;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastCommitDate?: string;
  error?: string;
}

export interface ProjectStatusDto {
  id: string;
  name: string;
  location: ProjectLocation;
  path: string;
  branch: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: number;
  lastCommitHash: string | null;
  lastCommitMessage: string | null;
  lastCommitDate: string | null;
  error: string | null;
  reportedAt: string;
  /** Local no reportó en la última ventana esperada (agente apagado/sin VPN). Server nunca es "stale": se recalcula cada minuto. */
  stale: boolean;
  /** Ficha técnica escrita a mano (para qué sirve, estado real, último trabajo) — ver project-meta.ts. Puede no existir para un id nuevo. */
  meta: ProjectMeta | null;
}

/** Si un reporte local es más viejo que esto, se marca "desactualizado" en vez de fallar silenciosamente. */
const LOCAL_STALE_AFTER_MS = 45 * 60 * 1000;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private serverCache: ProjectStatusDto[] = [];

  constructor(
    @InjectRepository(ProjectStatus)
    private readonly repo: Repository<ProjectStatus>,
  ) {
    void this.refreshServerProjects();
  }

  @Interval(60 * 1000)
  async refreshServerProjects() {
    this.serverCache = await Promise.all(SERVER_PROJECTS.map((def) => this.computeServerStatus(def)));
  }

  private async computeServerStatus(def: ServerProjectDef): Promise<ProjectStatusDto> {
    const base = {
      id: def.id,
      name: def.name,
      location: 'server' as const,
      path: def.path,
      reportedAt: new Date().toISOString(),
      stale: false,
      meta: PROJECT_META[def.id] ?? null,
    };
    try {
      const git = simpleGit(def.path);
      const status = await git.status();
      const log = await git.log({ maxCount: 1 }).catch(() => null);
      const last = log?.latest;
      return {
        ...base,
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        dirtyFiles: status.files.length,
        lastCommitHash: last?.hash?.slice(0, 7) ?? null,
        lastCommitMessage: last?.message ?? null,
        lastCommitDate: last?.date ?? null,
        error: null,
      };
    } catch (err) {
      this.logger.warn(`git status falló para ${def.id} (${def.path}): ${(err as Error).message}`);
      return {
        ...base,
        branch: null,
        ahead: 0,
        behind: 0,
        dirtyFiles: 0,
        lastCommitHash: null,
        lastCommitMessage: null,
        lastCommitDate: null,
        error: (err as Error).message,
      };
    }
  }

  async reportLocal(reports: LocalProjectReport[]): Promise<{ received: number }> {
    // upsert(), no save(): save() compara contra el valor ya guardado y SE
    // SALTA el UPDATE (incluido reportedAt) cuando nada cambió — que es
    // exactamente lo normal cuando un repo no tiene commits nuevos en 15 min.
    // El resultado real fue reportedAt congelado por horas en proyectos sin
    // actividad, aunque el agente sí reportaba bien cada vez. upsert() hace
    // un INSERT ... ON CONFLICT DO UPDATE incondicional: reportedAt siempre
    // se pone al valor de "ahora", haya cambiado el contenido o no.
    const rows = reports.map((r) => ({
      key: `local:${r.id}`,
      id: r.id,
      name: r.name,
      location: 'local' as const,
      path: r.path,
      branch: r.branch ?? null,
      ahead: r.ahead ?? 0,
      behind: r.behind ?? 0,
      dirtyFiles: r.dirtyFiles ?? 0,
      lastCommitHash: r.lastCommitHash ?? null,
      lastCommitMessage: r.lastCommitMessage ?? null,
      lastCommitDate: r.lastCommitDate ?? null,
      error: r.error ?? null,
      reportedAt: new Date(),
    }));
    await this.repo.upsert(rows, ['key']);
    this.logger.log(`Reporte local recibido: ${rows.length} proyecto(s)`);
    return { received: rows.length };
  }

  async getAll(): Promise<ProjectStatusDto[]> {
    const localRows = await this.repo.find({ where: { location: 'local' } });
    const now = Date.now();
    const local: ProjectStatusDto[] = localRows.map((r) => ({
      id: r.id,
      name: r.name,
      location: 'local',
      path: r.path,
      branch: r.branch,
      ahead: r.ahead,
      behind: r.behind,
      dirtyFiles: r.dirtyFiles,
      lastCommitHash: r.lastCommitHash,
      lastCommitMessage: r.lastCommitMessage,
      lastCommitDate: r.lastCommitDate,
      error: r.error,
      reportedAt: r.reportedAt.toISOString(),
      stale: now - r.reportedAt.getTime() > LOCAL_STALE_AFTER_MS,
      meta: PROJECT_META[r.id] ?? null,
    }));
    return [...this.serverCache, ...local];
  }
}
