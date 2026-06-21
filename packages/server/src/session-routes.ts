import type { FastifyInstance } from 'fastify';
import { validateLaunchRequest } from '@agent-citadel/shared';
import type { LiveSessionRegistry } from './sdk/sessions.js';

export interface SessionRoutesOptions { sessions: LiveSessionRegistry; }

export function registerSessionRoutes(app: FastifyInstance, opts: SessionRoutesOptions): void {
  app.get('/sessions', async () => ({ available: await opts.sessions.available(), sessions: opts.sessions.list() }));

  app.post('/sessions/launch', async (request, reply) => {
    const res = validateLaunchRequest(request.body);
    if (!res.ok) return reply.code(400).send({ error: res.error });
    if (!(await opts.sessions.available())) return reply.code(501).send({ error: 'Claude Agent SDK not installed' });
    try {
      return await opts.sessions.launch(res.value);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'launch failed' });
    }
  });

  app.post<{ Params: { id: string }; Body: { text?: string } }>('/sessions/:id/message', async (request, reply) => {
    const text = request.body?.text;
    if (typeof text !== 'string' || !text.trim()) return reply.code(400).send({ error: 'text required' });
    if (!opts.sessions.pushText(request.params.id, text)) return reply.code(404).send({ error: 'unknown session' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/sessions/:id/stop', async (request, reply) => {
    if (!(await opts.sessions.stop(request.params.id))) return reply.code(404).send({ error: 'unknown session' });
    return { ok: true };
  });
}
