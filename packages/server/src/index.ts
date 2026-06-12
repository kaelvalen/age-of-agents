import Fastify from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { SERVER_PORT, WS_PATH, type GameEvent } from '@agent-citadel/shared';
import { World } from './world.js';

const demoMode = process.argv.includes('--demo');

const app = Fastify({ logger: { level: 'info' } });
const world = new World();

app.get('/health', async () => ({ ok: true, demo: demoMode }));

// Wszystkie trasy MUSZĄ powstać przed listen() — fastify zamyka rejestrację.
if (demoMode) {
  // No-op, żeby zainstalowane hooki nie sypały 404 gdy chodzi tryb demo.
  app.post('/hooks', async () => ({ ok: true }));
  app.get('/hooks/status', async () => ({ installed: false, demo: true }));
} else {
  const { TranscriptWatcher } = await import('./watcher.js');
  const { translateHook, hooksInstalled, installHooks, uninstallHooks } = await import('./hooks.js');
  const watcher = new TranscriptWatcher(world);

  // Szybki kanał zdarzeń: hooki HTTP Claude Code (typ "http" w settings.json).
  app.post('/hooks', async (request) => {
    const translated = translateHook((request.body ?? {}) as never);
    if (translated) watcher.applyExternalFacts(translated.sessionId, translated.projectDir, translated.facts);
    return { ok: true };
  });
  app.get('/hooks/status', async () => ({ installed: await hooksInstalled() }));
  app.post('/hooks/install', async () => {
    await installHooks();
    app.log.info('Hooki zainstalowane w ~/.claude/settings.json');
    return { ok: true, installed: true };
  });
  app.post('/hooks/uninstall', async () => {
    await uninstallHooks();
    return { ok: true, installed: false };
  });

  app.addHook('onReady', async () => {
    watcher.start();
    app.log.info('Watcher transkryptów: obserwuję ~/.claude/projects');
  });
}

await app.listen({ port: SERVER_PORT, host: '127.0.0.1' });

const wss = new WebSocketServer({ server: app.server, path: WS_PATH });

function send(socket: WebSocket, event: GameEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

wss.on('connection', (socket) => {
  send(socket, { type: 'snapshot', ...world.snapshot() });
});

world.onEvent((event) => {
  for (const socket of wss.clients) send(socket, event);
});

if (demoMode) {
  const { startDemo } = await import('./demo/scenario.js');
  startDemo(world);
  app.log.info('Tryb demo: generator scenariuszy uruchomiony');
}

app.log.info(`Agent Citadel server: http://127.0.0.1:${SERVER_PORT} (ws: ${WS_PATH})`);
