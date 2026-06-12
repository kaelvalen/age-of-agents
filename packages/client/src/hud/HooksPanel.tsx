import { useEffect, useState } from 'react';

type Status = 'loading' | 'installed' | 'absent' | 'demo' | 'error';

/**
 * Tryb turbo: hooki HTTP Claude Code. Instalacja modyfikuje
 * ~/.claude/settings.json — wymaga jawnego potwierdzenia użytkownika.
 */
export function HooksPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch('/hooks/status');
      const data = await res.json();
      setStatus(data.demo ? 'demo' : data.installed ? 'installed' : 'absent');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (status === 'loading' || status === 'demo' || status === 'error') return null;

  const toggle = async () => {
    const installing = status === 'absent';
    const message = installing
      ? 'Zainstalować hooki HTTP w ~/.claude/settings.json?\n\nDzięki nim gra reaguje natychmiast (bez ~1 s opóźnienia). Powstanie kopia zapasowa settings.json.citadel-backup. Istniejące hooki nie są modyfikowane.'
      : 'Usunąć hooki Agent Citadel z ~/.claude/settings.json? (cudze wpisy zostają)';
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await fetch(installing ? '/hooks/install' : '/hooks/uninstall', { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="ghost" disabled={busy} onClick={toggle} title="Natychmiastowe zdarzenia z sesji Claude Code">
      {status === 'installed' ? '⚡ hooki: on' : '⚡ hooki: off'}
    </button>
  );
}
