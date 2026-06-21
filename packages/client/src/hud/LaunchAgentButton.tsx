import { useEffect, useState } from 'react';
import { useUi } from '../i18n';
import { sdkAvailable } from '../sessions';
import { LaunchAgentDialog } from './LaunchAgentDialog';

export function LaunchAgentButton() {
  const t = useUi();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => { void sdkAvailable().then(setAvailable); }, []);
  if (!available) return null; // hide when the SDK isn't installed
  return (
    <>
      <button className="ghost" onClick={() => setOpen(true)} title={t.launchAgent}>🚀 {t.launchAgent}</button>
      {open && <LaunchAgentDialog onClose={() => setOpen(false)} />}
    </>
  );
}
