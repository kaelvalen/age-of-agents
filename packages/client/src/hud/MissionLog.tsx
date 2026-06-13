import type { HeroSnapshot } from '@agent-citadel/shared';
import { useWorld } from '../store';
import { useUi } from '../i18n';

/** Linia meta misji: KTO + projekt + branch (bez powielania treści promptu). */
function metaLine(hero: HeroSnapshot | undefined, sessionId: string): string {
  const name = hero?.title || sessionId.slice(0, 8);
  const parts = [clip(name, 36)];
  if (hero?.projectName && hero.projectName !== name) parts.push(hero.projectName);
  if (hero?.gitBranch) parts.push(`⎇ ${hero.gitBranch}`);
  return parts.join(' · ');
}

/** Dziennik misji: aktywne na górze, potem ostatnie ukończone. */
export function MissionLog() {
  const missions = useWorld((s) => s.missions);
  const heroes = useWorld((s) => s.heroes);
  const selected = useWorld((s) => s.selectedSessionId);
  const selectedBuilding = useWorld((s) => s.selectedBuildingId);
  const t = useUi();
  if (selected || selectedBuilding) return null; // panel boczny/budynku przejmuje prawą stronę

  const all = Object.values(missions).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = all.filter((m) => m.status === 'active').slice(0, 5);
  const done = all.filter((m) => m.status !== 'active').slice(0, 5);
  if (active.length + done.length === 0) return null;

  return (
    <div className="hud-panel missions">
      <h3>{t.missions}</h3>
      {[...active, ...done].map((mission) => (
        <div key={mission.id} className="mission">
          <div>
            {mission.status === 'active' ? '⚔️' : mission.status === 'completed' ? '✅' : '💀'}{' '}
            {clip(mission.prompt, 90)}
          </div>
          <div className="meta">{metaLine(heroes[mission.sessionId], mission.sessionId)}</div>
        </div>
      ))}
    </div>
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
