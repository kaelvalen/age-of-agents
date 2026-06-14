import type { AgentKind } from '@agent-citadel/shared';
import type { Fact } from '../transcript/facts.js';

export type { AgentKind };

/** Wynik klasyfikacji pliku przez źródło: sesja (bohater), subagent (peon) lub nieistotny. */
export interface ClassifiedFile {
  kind: 'session' | 'subagent' | 'other';
  sessionId?: string;
  projectDir?: string;
  agentId?: string; // subagent
  parentSessionId?: string; // subagent
}

/**
 * Adapter jednego CLI (Claude/Codex). Watcher jest generyczny — całą wiedzę
 * o lokalizacji i formacie trzyma źródło. parseLine to CZYSTA funkcja (testowalna).
 */
export interface AgentSource {
  id: AgentKind;
  /** Katalog(i) do obserwacji, np. ~/.claude/projects lub ~/.codex/sessions. */
  roots(): string[];
  /** Głębokość chokidar (domyślnie 6). */
  depth?: number;
  classify(path: string, root: string): ClassifiedFile;
  parseLine(line: string): Fact[];
}
