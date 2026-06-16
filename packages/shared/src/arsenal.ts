/** Skąd pochodzi element arsenału (do plakietki w UI). */
export type ArsenalOrigin = 'project' | 'user' | 'plugin';

export interface ArsenalSkill {
  /** Goła nazwa skilla z frontmattera SKILL.md (np. 'brainstorming'). */
  id: string;
  description?: string;
  origin: ArsenalOrigin;
  /** Gdy origin === 'plugin' — nazwa pluginu wyprowadzona ze ścieżki. */
  pluginName?: string;
}

export interface ArsenalConnector {
  /** Nazwa serwera MCP (klucz w mcpServers), np. 'visualize'. */
  name: string;
  origin: ArsenalOrigin;
  transport?: 'stdio' | 'http' | 'sse';
}

export interface ArsenalHook {
  /** Zdarzenie, np. 'SessionStart', 'PreToolUse'. */
  event: string;
  /** Pełna komenda hooka (UI skraca do basename). */
  command: string;
  origin: ArsenalOrigin;
}

export interface ArsenalAgent {
  name: string;
  description?: string;
  origin: ArsenalOrigin;
}

/** Źródło A — statyczny ekwipunek jednego miasta (zastąpi ProjectIntel). */
export interface ProjectArsenal {
  projectDir: string;
  projectName: string;
  activeSessions: number;
  skills: ArsenalSkill[];
  connectors: ArsenalConnector[];
  hooks: ArsenalHook[];
  agents: ArsenalAgent[];
  refreshedAt: number;
}

/** Źródło B — co bohater REALNIE wyciągnął (distinct sety z atrybucji transkryptu). */
export interface WieldedArsenal {
  skills: string[];
  connectors: string[];
  plugins: string[];
}
