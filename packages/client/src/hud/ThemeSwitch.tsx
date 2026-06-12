import { useSettings } from '../settings';
import { HooksPanel } from './HooksPanel';

export function ThemeSwitch() {
  const themeId = useSettings((s) => s.themeId);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <div className="hud-panel" style={{ top: 12, left: 12, padding: 6, display: 'flex', gap: 6 }}>
      <button
        className="ghost"
        style={themeId === 'fantasy' ? { background: '#3b3b35' } : undefined}
        onClick={() => setTheme('fantasy')}
      >
        🏰 Fantasy
      </button>
      <button
        className="ghost"
        style={themeId === 'scifi' ? { background: '#3b3b35' } : undefined}
        onClick={() => setTheme('scifi')}
      >
        🛰️ Sci-Fi
      </button>
      <HooksPanel />
    </div>
  );
}
