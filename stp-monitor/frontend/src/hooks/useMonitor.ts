'use client';
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface DiskInfo {
  mount: string;
  used: number;
  total: number;
  percent: number;
}

export interface DashboardData {
  metrics: {
    cpu: { percent: number; cores: number };
    ram: { used: number; total: number; percent: number };
    disk: { used: number; total: number; percent: number };
    disks: DiskInfo[];
    network: { rxSec: number; txSec: number };
    uptime: number;
    loadAvg: [number, number, number];
    timestamp: string;
  };
  services: Array<{
    id: string; name: string; url: string; type: string;
    status: 'up' | 'down' | 'unknown';
    latency: number | null; lastCheck: string; uptimePercent: number;
  }>;
  containers: Array<{
    name: string; status: string; image: string; uptime: string; state: string;
  }>;
  alerts: Array<{
    id: string; serviceName: string; type: string; message: string; createdAt: string;
  }>;
  timestamp: string;
}

export function useMonitor() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Conecta al mismo origen para que Caddy proxee al backend — nunca localhost
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const socket = io(`${origin}/monitor`, {
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
      path: '/socket.io',
    });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('dashboard-update', (payload: DashboardData) => {
      setData(payload);
      setLastUpdate(new Date());
    });

    return () => { socket.disconnect(); };
  }, []);

  return { data, isConnected, lastUpdate };
}
