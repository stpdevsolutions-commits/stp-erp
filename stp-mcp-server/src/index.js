// Servidor MCP a la medida para STP — le da a Hermes Agent (u otro cliente
// MCP) acceso de herramientas sobre los sistemas reales de STP. Empieza
// acotado a Tickets (bajo riesgo) — Tareas/Vigía se pueden sumar después
// con el mismo patrón.
//
// Transporte: streamable HTTP (el que Hermes soporta vía `url` + `headers`
// en su config.yaml). Protegido con un bearer token propio (MCP_AUTH_TOKEN),
// separado de TICKETS_AGENT_KEY (que este servidor usa para hablar con la
// API de Tickets) — dos secretos, cada uno con su alcance.

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = process.env.PORT || 3005;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const TICKETS_API_URL = process.env.TICKETS_API_URL || 'http://stp-tickets-api:3003/api';
const TICKETS_AGENT_KEY = process.env.TICKETS_AGENT_KEY;

if (!MCP_AUTH_TOKEN) {
  console.error('MCP_AUTH_TOKEN no configurado — abortando.');
  process.exit(1);
}

async function ticketsFetch(path, init = {}) {
  const res = await fetch(`${TICKETS_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-agent-key': TICKETS_AGENT_KEY,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`API de tickets respondió ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function buildServer() {
  const server = new McpServer({ name: 'stp-tickets', version: '1.0.0' });

  server.registerTool(
    'list_projects',
    {
      description: 'Lista los proyectos de STP disponibles (para poder ubicar el projectId al crear un ticket).',
      inputSchema: {},
    },
    async () => {
      const projects = await ticketsFetch('/projects');
      return { content: [{ type: 'text', text: JSON.stringify(projects) }] };
    },
  );

  server.registerTool(
    'list_tickets',
    {
      description: 'Lista tickets de STP (bugs/cambios/mejoras), con filtros opcionales.',
      inputSchema: {
        projectId: z.string().optional().describe('UUID del proyecto (usar list_projects para obtenerlo)'),
        status: z.enum(['pending', 'in_progress', 'review', 'done', 'cancelled']).optional(),
        type: z.enum(['bug', 'mejora', 'cambio']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      },
    },
    async ({ projectId, status, type, priority }) => {
      const qs = new URLSearchParams(
        Object.entries({ projectId, status, type, priority }).filter(([, v]) => v),
      ).toString();
      const tickets = await ticketsFetch(`/tickets${qs ? `?${qs}` : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(tickets) }] };
    },
  );

  server.registerTool(
    'create_ticket',
    {
      description:
        'Crea un ticket nuevo en STP Tickets (bug, cambio o mejora) para un proyecto. Usa list_projects primero si no tienes el projectId.',
      inputSchema: {
        projectId: z.string().describe('UUID del proyecto'),
        title: z.string().min(2).max(200),
        description: z.string().optional(),
        type: z.enum(['bug', 'mejora', 'cambio']),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        reportedBy: z.string().optional().describe('Quién lo reporta (nombre de la persona en el chat)'),
      },
    },
    async (args) => {
      const ticket = await ticketsFetch('/tickets', {
        method: 'POST',
        body: JSON.stringify(args),
      });
      return { content: [{ type: 'text', text: JSON.stringify(ticket) }] };
    },
  );

  server.registerTool(
    'update_ticket_status',
    {
      description: 'Cambia el estado de un ticket existente (por número, ej. el #12).',
      inputSchema: {
        ticketId: z.string().describe('UUID del ticket (usar list_tickets para encontrarlo por número)'),
        status: z.enum(['pending', 'in_progress', 'review', 'done', 'cancelled']),
      },
    },
    async ({ ticketId, status }) => {
      const ticket = await ticketsFetch(`/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(ticket) }] };
    },
  );

  return server;
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Streamable HTTP MCP, sin estado entre peticiones — se crea un server+
// transport nuevo por request, patrón recomendado por el SDK para HTTP
// stateless (no hay sesión de larga duración que mantener en memoria).
app.post('/mcp', async (req, res) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${MCP_AUTH_TOKEN}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('Error en /mcp:', err);
    if (!res.headersSent) res.status(500).json({ error: 'internal error' });
  }
});

app.listen(PORT, () => console.log(`Servidor MCP de STP escuchando en :${PORT}`));
