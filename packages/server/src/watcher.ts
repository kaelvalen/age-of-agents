import { watch, type FSWatcher } from 'chokidar';
import { homedir } from 'node:os';
import { basename, join, sep } from 'node:path';
import type { PeonSnapshot } from '@agent-citadel/shared';
import { interpretLine } from './transcript/parser.js';
import { TailRegistry } from './transcript/tail.js';
import { DEFAULT_THRESHOLDS, SessionTracker, type StateThresholds } from './state-machine.js';
import type { World } from './world.js';

/** Sesje starsze niż to okno ignorujemy przy starcie (historia, nie żywe). */
const LIVE_WINDOW_MS = 10 * 60_000;
/** Większe pliki tail-ujemy od końca zamiast odtwarzać całą historię. */
const REPLAY_MAX_BYTES = 2 * 1024 * 1024;
const SWEEP_INTERVAL_MS = 15_000;

interface PeonEntry {
  peon: PeonSnapshot;
  lastWriteMs: number;
}

/**
 * Obserwuje ~/.claude/projects/**: główne transkrypty sesji (bohaterowie)
 * i transkrypty subagentów w <sesja>/subagents/** (peony).
 */
export class TranscriptWatcher {
  private tails = new TailRegistry();
  private trackers = new Map<string, SessionTracker>();
  private peons = new Map<string, PeonEntry>();
  private watcher?: FSWatcher;
  private sweepTimer?: NodeJS.Timeout;
  private queue = Promise.resolve();

  constructor(
    private readonly world: World,
    private readonly root = join(homedir(), '.claude', 'projects'),
    private readonly thresholds: StateThresholds = DEFAULT_THRESHOLDS,
  ) {}

  start(): void {
    this.watcher = watch(this.root, {
      depth: 6,
      ignoreInitial: false,
      alwaysStat: true,
      // Ignorujemy wyłącznie POTWIERDZONE pliki bez .jsonl — gdy chokidar
      // woła bez stats (katalogi przy skanie), nie wolno ignorować, bo
      // odetniemy traversal całego drzewa.
      ignored: (path, stats) => stats?.isFile() === true && !path.endsWith('.jsonl'),
    });
    const enqueue = (path: string, stats?: { mtimeMs?: number; size?: number }, initial = false) => {
      this.queue = this.queue
        .then(() => this.handleFile(path, stats, initial))
        .catch((err) => console.error('[watcher]', path, err));
    };
    this.watcher.on('add', (path, stats) => enqueue(path, stats, true));
    this.watcher.on('change', (path, stats) => enqueue(path, stats, false));
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    clearInterval(this.sweepTimer);
    await this.watcher?.close();
  }

  /** Szybki kanał: fakty z hooków HTTP trafiają do tej samej maszyny stanów. */
  applyExternalFacts(sessionId: string, projectDir: string, facts: import('./transcript/facts.js').Fact[]): void {
    let tracker = this.trackers.get(sessionId);
    if (!tracker) {
      tracker = new SessionTracker(this.world, sessionId, projectDir, this.thresholds);
      this.trackers.set(sessionId, tracker);
    }
    for (const fact of facts) tracker.apply(fact);
  }

  private classify(path: string): { kind: 'session'; sessionId: string; projectDir: string }
    | { kind: 'subagent'; agentId: string; parentSessionId: string }
    | { kind: 'other' } {
    const rel = path.slice(this.root.length + 1);
    const parts = rel.split(sep);
    const file = basename(path, '.jsonl');
    if (parts.length === 2) {
      return { kind: 'session', sessionId: file, projectDir: parts[0] };
    }
    if (parts.includes('subagents') && basename(path).startsWith('agent-')) {
      // <proj>/<sessionUuid>/subagents/**/agent-<id>.jsonl
      return { kind: 'subagent', agentId: file.replace(/^agent-/, ''), parentSessionId: parts[1] };
    }
    return { kind: 'other' };
  }

  private async handleFile(
    path: string,
    stats: { mtimeMs?: number; size?: number } | undefined,
    initial: boolean,
  ): Promise<void> {
    if (!path.endsWith('.jsonl')) return;
    const target = this.classify(path);
    if (target.kind === 'other') return;

    if (!this.tails.has(path)) {
      const fresh = !initial || (stats?.mtimeMs ?? 0) > Date.now() - LIVE_WINDOW_MS;
      if (!fresh) return; // stara sesja — obudzi się przy zdarzeniu 'change'
      if ((stats?.size ?? 0) > REPLAY_MAX_BYTES) await this.tails.registerAtEnd(path);
    }

    const lines = await this.tails.readNewLines(path);
    if (lines.length === 0) return;

    if (target.kind === 'session') {
      let tracker = this.trackers.get(target.sessionId);
      if (!tracker) {
        tracker = new SessionTracker(this.world, target.sessionId, target.projectDir, this.thresholds);
        this.trackers.set(target.sessionId, tracker);
      }
      for (const line of lines) {
        for (const fact of interpretLine(line)) tracker.apply(fact);
      }
    } else {
      this.applyPeonLines(target.agentId, target.parentSessionId, lines);
    }
  }

  private applyPeonLines(agentId: string, parentSessionId: string, lines: string[]): void {
    let entry = this.peons.get(agentId);
    if (!entry) {
      entry = {
        peon: { agentId, parentSessionId, state: 'working' },
        lastWriteMs: Date.now(),
      };
      this.peons.set(agentId, entry);
    }
    entry.lastWriteMs = Date.now();

    for (const line of lines) {
      for (const fact of interpretLine(line)) {
        if (fact.kind === 'tool-start') {
          entry.peon = { ...entry.peon, state: 'working', currentTool: fact.tool, description: fact.detail ?? entry.peon.description };
        } else if (fact.kind === 'thinking') {
          entry.peon = { ...entry.peon, state: 'thinking', currentTool: undefined };
        } else if (fact.kind === 'prompt' && !entry.peon.description) {
          entry.peon = { ...entry.peon, description: fact.text.slice(0, 80) };
        }
      }
    }
    this.world.upsertPeon(entry.peon);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [sessionId, tracker] of this.trackers) {
      if (tracker.tick(now) === 'remove') this.trackers.delete(sessionId);
    }
    for (const [agentId, entry] of this.peons) {
      if (now - entry.lastWriteMs > this.thresholds.peonDoneAfterMs) {
        this.world.completePeon(agentId);
        this.peons.delete(agentId);
      }
    }
  }
}
