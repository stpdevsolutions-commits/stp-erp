'use client';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMonitor, DashboardData } from '@/hooks/useMonitor';
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

export default function Dashboard() {
  const { data, isConnected, lastUpdate } = useMonitor();

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
    </div>
  );
}
