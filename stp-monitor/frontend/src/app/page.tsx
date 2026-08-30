'use client';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMonitor, DashboardData, ProjectEntry } from '@/hooks/useMonitor';
import { formatBytes, formatUptime, formatRelativeTime, getProgressColor, getStatusColor } from '@/lib/format';

// --- Sparkline SVG (sin librería, cero overhead) ---
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-8 mt-1" />;
  const max = Math.max(...values, 1);
  const W = 100, H = 32;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - (v / max) * H}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1" style={{ height: 32 }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
      <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = getStatusColor(status);
  const isDown = status === 'down' || status === 'exited';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${isDown ? 'pulse-dot' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

// --- Hook: historial de los últimos 30 valores (2.5 min a 5s) ---
function useHistory(value: number | undefined, max = 30) {
  const [history, setHistory] = useState<number[]>([]);
  const prev = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (value === undefined || value === prev.current) return;
    prev.current = value;
    setHistory(h => [...h.slice(-(max - 1)), value]);
  }, [value, max]);
  return history;
}

// --- Detalle de proyecto (modal) ---
function ProjectDetailModal({ project, onClose }: { project: ProjectEntry; onClose: () => void }) {
  const dirty = project.dirtyFiles > 0;
  const hasError = !!project.error;
  const dotColor = hasError ? '#ef4444' : project.stale ? '#6b7280' : dirty ? '#f59e0b' : '#10b981';

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: '#00000090' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl border w-full max-w-lg max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b"
          style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
              <h3 className="text-base font-bold text-white">{project.name}</h3>
            </div>
            <span className="text-xs px-1.5 py-0.5 rounded font-medium mt-1.5 inline-block" style={{
              color: project.location === 'server' ? '#60a5fa' : '#c084fc',
              backgroundColor: project.location === 'server' ? '#60a5fa22' : '#c084fc22',
            }}>
              {project.location === 'server' ? 'Servidor' : 'Local'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none px-1" aria-label="Cerrar">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {project.meta ? (
            <>
              <p className="text-sm text-gray-300 leading-relaxed">{project.meta.purpose}</p>

              <div className="flex flex-wrap gap-1.5">
                {project.meta.stack.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: '#1f2937', color: '#93c5fd' }}>
                    {s}
                  </span>
                ))}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Estado</div>
                <p className="text-sm text-gray-300 leading-relaxed">{project.meta.status}</p>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Lo último que se hizo</div>
                <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside marker:text-gray-600">
                  {project.meta.recentWork.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>

              {project.meta.links && project.meta.links.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {project.meta.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
                      className="text-xs font-medium" style={{ color: '#60a5fa' }}>
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 italic">Sin ficha técnica escrita todavía para este proyecto.</p>
          )}

          <div className="border-t pt-3" style={{ borderColor: '#1f2937' }}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Detalle técnico en vivo</div>
            {hasError ? (
              <p className="text-xs" style={{ color: '#ef4444' }}>{project.error}</p>
            ) : (
              <div className="text-xs text-gray-400 font-mono space-y-1">
                <div>Rama: <span className="text-gray-300">{project.branch ?? '—'}</span></div>
                <div>Ruta: <span className="text-gray-300">{project.path}</span></div>
                {project.lastCommitHash && (
                  <div className="break-words">
                    Último commit: <span className="text-gray-300">{project.lastCommitHash}</span> — {project.lastCommitMessage}
                    {project.lastCommitDate && <span className="text-gray-600"> ({formatRelativeTime(project.lastCommitDate)})</span>}
                  </div>
                )}
                <div>
                  {dirty ? <span style={{ color: dotColor }}>{project.dirtyFiles} archivo(s) sin commitear</span> : 'Working tree limpio'}
                  {project.ahead > 0 && <span style={{ color: '#60a5fa' }}> · ↑{project.ahead} sin subir</span>}
                  {project.behind > 0 && <span style={{ color: '#f59e0b' }}> · ↓{project.behind} detrás del remoto</span>}
                </div>
                {project.location === 'local' && (
                  <div className={project.stale ? '' : 'text-gray-600'} style={project.stale ? { color: '#f59e0b' } : undefined}>
                    {project.stale ? '⚠ el agente local no reporta hace rato' : `reportado ${formatRelativeTime(project.reportedAt)}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isConnected, lastUpdate } = useMonitor();
  const [selectedProject, setSelectedProject] = useState<ProjectEntry | null>(null);

  // Si Vigía manda un dato más fresco del mismo proyecto mientras el modal está abierto, que se actualice en vivo en vez de quedar congelado.
  useEffect(() => {
    if (!selectedProject || !data) return;
    const fresh = data.projects.find((p) => p.id === selectedProject.id && p.location === selectedProject.location);
    if (fresh && fresh !== selectedProject) setSelectedProject(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const cpuHistory = useHistory(data?.metrics.cpu.percent);
  const ramHistory = useHistory(data?.metrics.ram.percent);
  const rxHistory  = useHistory(data?.metrics.network?.rxSec);
  const txHistory  = useHistory(data?.metrics.network?.txSec);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0f1e' }}>
      {/* Navbar */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10"
        style={{ backgroundColor: '#0a0f1e99', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Vigía" width={160} height={46} priority />
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-500 hidden sm:block">
              Actualizado {lastUpdate.toLocaleTimeString('es-DO')}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'pulse-dot' : ''}`}
              style={{ backgroundColor: isConnected ? '#10b981' : '#ef4444', boxShadow: `0 0 6px ${isConnected ? '#10b981' : '#ef4444'}` }} />
            <span className="text-xs text-gray-400">{isConnected ? 'En línea' : 'Desconectado'}</span>
          </div>
        </div>
      </nav>

      <div className="p-4 sm:p-6 space-y-6 max-w-screen-xl mx-auto">
        {!data ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Conectando con el servidor...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── SERVIDOR ── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Servidor</h2>

              {/* Fila 1: CPU · RAM · Uptime */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">

                {/* CPU */}
                <div className="rounded-xl p-4 border" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 font-medium">CPU</span>
                    <span className="text-xs text-gray-500">{data.metrics.cpu.cores} núcleos</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {data.metrics.cpu.percent}<span className="text-sm font-normal text-gray-400">%</span>
                  </div>
                  <Sparkline values={cpuHistory} color={getProgressColor(data.metrics.cpu.percent)} />
                  <MetricBar percent={data.metrics.cpu.percent} color={getProgressColor(data.metrics.cpu.percent)} />
                  <div className="text-xs text-gray-500 mt-1">Load: {data.metrics.loadAvg[0].toFixed(2)}</div>
                </div>

                {/* RAM */}
                <div className="rounded-xl p-4 border" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 font-medium">RAM</span>
                    <span className="text-xs text-gray-500">{data.metrics.ram.percent}%</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{formatBytes(data.metrics.ram.used)}</div>
                  <Sparkline values={ramHistory} color={getProgressColor(data.metrics.ram.percent)} />
                  <MetricBar percent={data.metrics.ram.percent} color={getProgressColor(data.metrics.ram.percent)} />
                  <div className="text-xs text-gray-500 mt-1">de {formatBytes(data.metrics.ram.total)}</div>
                </div>

                {/* Uptime */}
                <div className="rounded-xl p-4 border" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 font-medium">Uptime</span>
                    <span className="w-2 h-2 rounded-full pulse-dot" style={{ backgroundColor: '#10b981' }} />
                  </div>
                  <div className="text-2xl font-bold text-white">{formatUptime(data.metrics.uptime)}</div>
                  <div className="text-xs text-gray-500 mt-1">Load 5m: {data.metrics.loadAvg[1].toFixed(2)}</div>
                  <div className="text-xs text-gray-500">Load 15m: {data.metrics.loadAvg[2].toFixed(2)}</div>
                </div>
              </div>

              {/* Fila 2: Discos + Red */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

                {/* Disco por cada montaje */}
                {(data.metrics.disks ?? [data.metrics.disk && { mount: '/', ...data.metrics.disk }]).map((d) => {
                  const color = getProgressColor(d.percent);
                  return (
                    <div key={d.mount} className="rounded-xl p-4 border" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 font-medium">Disco <code className="text-blue-400">{d.mount}</code></span>
                        <span className="text-xs text-gray-500">{d.percent}%</span>
                      </div>
                      <div className="text-2xl font-bold text-white">{formatBytes(d.used)}</div>
                      <MetricBar percent={d.percent} color={color} />
                      <div className="text-xs text-gray-500 mt-1">de {formatBytes(d.total)}</div>
                    </div>
                  );
                })}

                {/* Red */}
                {data.metrics.network && (
                  <div className="rounded-xl p-4 border" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400 font-medium">Red</span>
                      <span className="text-xs text-gray-500">tiempo real</span>
                    </div>
                    <div className="space-y-2 mt-1">
                      <div>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-green-400">↓ RX</span>
                          <span className="text-white font-medium">{formatBytes(data.metrics.network.rxSec)}/s</span>
                        </div>
                        <Sparkline values={rxHistory} color="#10b981" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-blue-400">↑ TX</span>
                          <span className="text-white font-medium">{formatBytes(data.metrics.network.txSec)}/s</span>
                        </div>
                        <Sparkline values={txHistory} color="#3b82f6" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── SERVICIOS ── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Servicios
                <span className="ml-2 text-xs font-normal">
                  <span style={{ color: '#10b981' }}>{data.services.filter(s => s.status === 'up').length} activos</span>
                  {data.services.filter(s => s.status === 'down').length > 0 && (
                    <span className="ml-2" style={{ color: '#ef4444' }}>{data.services.filter(s => s.status === 'down').length} caídos</span>
                  )}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.services.map((svc) => (
                  <div key={svc.id} className="rounded-xl p-4 border flex items-start gap-3 transition-all"
                    style={{
                      backgroundColor: '#111827',
                      borderColor: svc.status === 'down' ? '#ef444433' : '#1f2937',
                      boxShadow: svc.status === 'down' ? '0 0 0 1px #ef444422' : 'none',
                    }}>
                    <StatusDot status={svc.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white text-sm truncate">{svc.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                          style={{ color: getStatusColor(svc.status), backgroundColor: `${getStatusColor(svc.status)}22` }}>
                          {svc.status === 'up' ? 'Activo' : svc.status === 'down' ? 'Caído' : 'Desconocido'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">{svc.latency != null ? `${svc.latency}ms` : '—'}</span>
                        <span className="text-xs font-medium" style={{
                          color: svc.uptimePercent >= 99 ? '#10b981' : svc.uptimePercent >= 95 ? '#f59e0b' : '#ef4444'
                        }}>{svc.uptimePercent}% uptime</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-0.5 mt-1.5">
                        <div className="h-0.5 rounded-full transition-all duration-700" style={{
                          width: `${Math.min(svc.uptimePercent, 100)}%`,
                          backgroundColor: svc.uptimePercent >= 99 ? '#10b981' : svc.uptimePercent >= 95 ? '#f59e0b' : '#ef4444'
                        }} />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{formatRelativeTime(svc.lastCheck)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── PROYECTOS ── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Proyectos
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {data.projects.filter(p => p.dirtyFiles === 0 && !p.error).length} limpios de {data.projects.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.projects.map((p) => {
                  const dirty = p.dirtyFiles > 0;
                  const hasError = !!p.error;
                  const dotColor = hasError ? '#ef4444' : p.stale ? '#6b7280' : dirty ? '#f59e0b' : '#10b981';
                  return (
                    <div key={`${p.location}:${p.id}`}
                      className="rounded-xl p-4 border cursor-pointer transition-colors hover:border-gray-600"
                      style={{ backgroundColor: '#111827', borderColor: hasError ? '#ef444433' : '#1f2937' }}
                      onClick={() => setSelectedProject(p)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedProject(p); }}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-medium text-white text-sm truncate">{p.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{
                          color: p.location === 'server' ? '#60a5fa' : '#c084fc',
                          backgroundColor: p.location === 'server' ? '#60a5fa22' : '#c084fc22',
                        }}>
                          {p.location === 'server' ? 'Servidor' : 'Local'}
                        </span>
                      </div>

                      {hasError ? (
                        <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{p.error}</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                            <span className="font-mono">{p.branch ?? '—'}</span>
                            {p.ahead > 0 && <span style={{ color: '#60a5fa' }}>↑{p.ahead}</span>}
                            {p.behind > 0 && <span style={{ color: '#f59e0b' }}>↓{p.behind}</span>}
                            {dirty && <span style={{ color: dotColor }}>{p.dirtyFiles} sin commitear</span>}
                          </div>
                          {p.lastCommitMessage && (
                            <p className="text-xs text-gray-500 mt-2 truncate" title={p.lastCommitMessage}>
                              <span className="font-mono text-gray-600">{p.lastCommitHash}</span> {p.lastCommitMessage}
                            </p>
                          )}
                        </>
                      )}

                      <div className="text-xs text-gray-600 mt-2 flex items-center justify-between gap-2">
                        <span className="truncate">{p.lastCommitDate ? formatRelativeTime(p.lastCommitDate) : ''}</span>
                        {p.location === 'local' && (
                          <span className="flex-shrink-0" style={{ color: p.stale ? '#f59e0b' : undefined }}>
                            {p.stale ? '⚠ sin reportar' : `reportado ${formatRelativeTime(p.reportedAt)}`}
                          </span>
                        )}
                      </div>
                      {p.meta && <div className="text-xs mt-2" style={{ color: '#3b82f6' }}>Ver detalle →</div>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── CONTENEDORES ── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Contenedores Docker
                <span className="ml-2 text-xs font-normal text-gray-500">{data.containers.length} total</span>
              </h2>
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: '#1f2937' }}>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Contenedor</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Imagen</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Uptime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.containers.map((c) => (
                      <tr key={c.name} className="border-b last:border-0 hover:bg-gray-800 transition-colors" style={{ borderColor: '#1f2937' }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusDot status={c.state} />
                            <span className="font-medium text-white text-xs">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell truncate max-w-[200px]">{c.image}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded"
                            style={{ color: getStatusColor(c.state), backgroundColor: `${getStatusColor(c.state)}22` }}>
                            {c.state}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── ALERTAS ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Alertas Recientes
                  {data.alerts.length > 0 && (
                    <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded"
                      style={{ color: '#f59e0b', backgroundColor: '#f59e0b22' }}>
                      {data.alerts.length}
                    </span>
                  )}
                </h2>
              </div>
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}>
                {data.alerts.length === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-5">
                    <span className="text-xl">✅</span>
                    <span className="text-sm text-gray-400">Todo en orden — sin alertas en las últimas 24 horas.</span>
                  </div>
                ) : (
                  data.alerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: '#1f2937' }}>
                      <span className="text-base flex-shrink-0 mt-0.5">
                        {alert.type === 'down' ? '🔴' : alert.type === 'up' ? '✅' : '⚠️'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-white text-sm">{alert.serviceName}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">{formatRelativeTime(alert.createdAt)}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{alert.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {selectedProject && (
        <ProjectDetailModal project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </div>
  );
}
