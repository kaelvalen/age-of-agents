import { getGameView } from '../game/view';
import { TEAM_COLORS } from '../game/placeholders';
import { useWorld } from '../store';
import { useUi } from '../i18n';

export function Portraits() {
  const heroes = useWorld((s) => s.heroes);
  const selected = useWorld((s) => s.selectedSessionId);
  const select = useWorld((s) => s.select);
  const t = useUi();

  const list = Object.values(heroes).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (list.length === 0) return null;

  return (
    <div className="hud-panel portraits">
      {list.map((hero) => {
        const color = TEAM_COLORS[hero.teamColor % TEAM_COLORS.length];
        const cssColor = `#${color.toString(16).padStart(6, '0')}`;
        return (
          <div
            key={hero.sessionId}
            className={`portrait${selected === hero.sessionId ? ' selected' : ''}`}
            style={{ borderColor: cssColor, opacity: hero.state === 'sleeping' ? 0.5 : 1 }}
            title={hero.title}
            onClick={() => {
              select(hero.sessionId);
              getGameView()?.centerOnUnit(hero.sessionId);
            }}
          >
            <div className="face" style={{ background: cssColor }}>
              {hero.title.slice(0, 1).toUpperCase()}
            </div>
            <div className="state">
              {hero.state === 'awaiting-input' ? '❗ ' : ''}
              {t.states[hero.state]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
