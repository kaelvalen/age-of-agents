import { create } from 'zustand';
import type {
  GameEvent,
  HeroSnapshot,
  MissionSnapshot,
  PeonSnapshot,
  TranscriptLine,
} from '@agent-citadel/shared';
import { deriveNotification, DEDUP_WINDOW, MAX_VISIBLE, type Notification } from './notifications';

interface WorldStore {
  connected: boolean;
  heroes: Record<string, HeroSnapshot>;
  peons: Record<string, PeonSnapshot>;
  missions: Record<string, MissionSnapshot>;
  /** Ostatnie linie transkryptu per sesja (bufor do panelu bocznego). */
  transcripts: Record<string, TranscriptLine[]>;
  /** Efemeryczne powiadomienia (stos w lewym-górnym rogu). */
  notifications: Notification[];
  selectedSessionId?: string;
  selectedBuildingId?: string;
  setConnected(connected: boolean): void;
  select(sessionId?: string): void;
  selectBuilding(buildingId?: string): void;
  dismissNotification(id: string): void;
  apply(event: GameEvent): void;
}

const TRANSCRIPT_BUFFER = 200;

/** Wstaw powiadomienie z dedupem (sessionId+reason w oknie per-waga) i limitem stosu. */
function addNotif(list: Notification[], n: Notification | null, now: number): Notification[] {
  if (!n) return list;
  const dup = list.some(
    (e) => e.sessionId === n.sessionId && e.reason === n.reason && now - e.createdAt < DEDUP_WINDOW[n.kind],
  );
  if (dup) return list;
  return [...list, n].slice(-MAX_VISIBLE);
}

export const useWorld = create<WorldStore>((set) => ({
  connected: false,
  heroes: {},
  peons: {},
  missions: {},
  transcripts: {},
  notifications: [],
  setConnected: (connected) => set({ connected }),
  // Wybór jednostki i budynku wzajemnie się wykluczają (jeden panel po prawej).
  select: (selectedSessionId) => set({ selectedSessionId, selectedBuildingId: undefined }),
  selectBuilding: (selectedBuildingId) => set({ selectedBuildingId, selectedSessionId: undefined }),
  dismissNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
  apply: (event) =>
    set((state) => {
      switch (event.type) {
        case 'snapshot':
          return {
            heroes: Object.fromEntries(event.heroes.map((h) => [h.sessionId, h])),
            peons: Object.fromEntries(event.peons.map((p) => [p.agentId, p])),
            missions: Object.fromEntries(event.missions.map((m) => [m.id, m])),
          };
        case 'hero-spawned':
        case 'hero-updated': {
          const prev = state.heroes[event.hero.sessionId];
          const now = Date.now();
          return {
            heroes: { ...state.heroes, [event.hero.sessionId]: event.hero },
            notifications: addNotif(state.notifications, deriveNotification(prev, event, now), now),
          };
        }
        case 'hero-removed': {
          const heroes = { ...state.heroes };
          delete heroes[event.sessionId];
          return { heroes };
        }
        case 'peon-spawned':
        case 'peon-updated':
          return { peons: { ...state.peons, [event.peon.agentId]: event.peon } };
        case 'peon-completed': {
          const peons = { ...state.peons };
          delete peons[event.agentId];
          return { peons };
        }
        case 'mission-started':
        case 'mission-completed': {
          const now = Date.now();
          return {
            missions: { ...state.missions, [event.mission.id]: event.mission },
            notifications: addNotif(state.notifications, deriveNotification(undefined, event, now), now),
          };
        }
        case 'transcript-line': {
          const lines = state.transcripts[event.line.sessionId] ?? [];
          return {
            transcripts: {
              ...state.transcripts,
              [event.line.sessionId]: [...lines, event.line].slice(-TRANSCRIPT_BUFFER),
            },
          };
        }
        default:
          return state;
      }
    }),
}));

// Dev-only uchwyt do debugowania żywego świata z konsoli (np. wstrzyknięcie
// snapshotu, inspekcja heroes/peons). Nie trafia do builda produkcyjnego.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  (globalThis as Record<string, unknown>).__world = useWorld;
}
