import { useSettings } from '../settings';
import { useUi } from '../i18n';
import { HooksPanel } from './HooksPanel';

export function ThemeSwitch() {
  const themeId = useSettings((s) => s.themeId);
  const setTheme = useSettings((s) => s.setTheme);
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);
  const t = useUi();

  return (
    <div className="hud-panel" style={{ top: 12, left: 12, padding: 6, display: 'flex', gap: 6 }}>
      <button
        className="ghost"
        style={themeId === 'fantasy' ? { background: '#3b3b35' } : undefined}
        onClick={() => setTheme('fantasy')}
      >
        🏰 {t.fantasy}
      </button>
      <button
        className="ghost"
        style={themeId === 'scifi' ? { background: '#3b3b35' } : undefined}
        onClick={() => setTheme('scifi')}
      >
        🛰️ {t.scifi}
      </button>
      <HooksPanel />
      <button className="ghost" onClick={() => setLang(lang === 'en' ? 'pl' : 'en')} title="Language / Język">
        🌐 {t.langLabel}
      </button>
    </div>
  );
}
