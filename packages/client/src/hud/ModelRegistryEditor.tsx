import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  validateModelConfig,
  resolveSprite,
  resolveContextWindow,
  matchModel,
  SPRITE_IDS,
  type ModelConfig,
  type ModelMatch,
  type SpriteId,
  type SpriteRule,
  type WindowRule,
} from '../theme/models';
import { useModels } from '../model-store';
import { useWorld } from '../store';
import { useUi, type UiStrings } from '../i18n';
import { formatK } from '../util';

export function ModelRegistryEditor() {
  const models = useModels((s) => s.models);
  const setModels = useModels((s) => s.setModels);
  const resetModels = useModels((s) => s.resetModels);
  const heroes = useWorld((s) => s.heroes);
  const t = useUi();

  // Odrębne modele widziane w bieżących sesjach.
  const seen = useMemo(() => {
    const set = new Set<string>();
    for (const h of Object.values(heroes)) if (h.model) set.add(h.model);
    return [...set];
  }, [heroes]);

  const setSprites = (sprites: SpriteRule[]) => setModels({ ...models, sprites });
  const setWindows = (windows: WindowRule[]) => setModels({ ...models, windows });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{t.modelsHint}</div>

      {/* Widziane modele — prosta wersja: dopasowanie sprite/okno + flaga fallback. */}
      {seen.length > 0 && (
        <div className="cov-strip" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <span className="px" style={{ opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
            {t.seenModels}
          </span>
          {seen.map((m) => {
            const matched =
              models.sprites.some((r) => matchModel(m, r.match)) ||
              models.windows.some((r) => matchModel(m, r.match));
            return (
              <div key={m} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ opacity: 0.9 }}>{m}</code>
                <span className="bre-chip bre-chip--exact">{resolveSprite(m, models).sprite}</span>
                <span className="bre-chip bre-chip--prefix">{formatK(resolveContextWindow(m, models))}</span>
                {!matched && <span style={{ color: '#ef9f27' }}>⚠ {t.usesFallback}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Oś tożsamości. */}
      <Section title={`👤 ${t.spriteAndName}`}>
        {models.sprites.map((r, i) => (
          <SpriteRow
            key={i}
            rule={r}
            t={t}
            onChange={(next) => setSprites(models.sprites.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setSprites(models.sprites.filter((_, j) => j !== i))}
          />
        ))}
        <button
          className="bre-addbtn"
          onClick={() => setSprites([...models.sprites, { match: { kind: 'pattern', pattern: '' }, sprite: SPRITE_IDS[0] }])}
        >
          {t.addRow}
        </button>
      </Section>

      {/* Oś pojemności. */}
      <Section title={`📦 ${t.contextWindowSection}`}>
        {models.windows.map((r, i) => (
          <WindowRow
            key={i}
            rule={r}
            t={t}
            onChange={(next) => setWindows(models.windows.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setWindows(models.windows.filter((_, j) => j !== i))}
          />
        ))}
        <button
          className="bre-addbtn"
          onClick={() => setWindows([...models.windows, { match: { kind: 'pattern', pattern: '' }, contextWindow: 200_000 }])}
        >
          {t.addRow}
        </button>
      </Section>

      {/* Fallback (niedopasowane). */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span className="px" style={{ opacity: 0.7 }}>{t.fallbackLabel}:</span>
        <select
          className="bre-input"
          aria-label={t.spriteLabel}
          value={models.fallback.sprite}
          onChange={(e) => setModels({ ...models, fallback: { ...models.fallback, sprite: e.target.value as SpriteId } })}
        >
          {SPRITE_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          className="bre-input"
          style={{ width: 110 }}
          type="number"
          min={1}
          aria-label={t.windowLabel}
          value={models.fallback.contextWindow}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n > 0) setModels({ ...models, fallback: { ...models.fallback, contextWindow: n } });
          }}
        />
        <span style={{ opacity: 0.6 }}>{t.windowLabel}</span>
      </div>

      {/* JSON — zapis/wgranie (debounce 400 ms, walidacja). */}
      <ModelJsonEditor models={models} setModels={setModels} t={t} />

      <div>
        <button className="ghost" onClick={resetModels}>↺ {t.restoreDefaults}</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="px" style={{ fontSize: 13 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function MatchEditor({ match, t, onChange }: { match: ModelMatch; t: UiStrings; onChange: (m: ModelMatch) => void }) {
  const value = match.kind === 'exact' ? match.id : match.pattern;
  return (
    <>
      <select
        className="bre-input"
        aria-label="match kind"
        value={match.kind}
        onChange={(e) =>
          onChange(e.target.value === 'exact' ? { kind: 'exact', id: value } : { kind: 'pattern', pattern: value })
        }
      >
        <option value="pattern">{t.matchPattern}</option>
        <option value="exact">{t.matchExact}</option>
      </select>
      <input
        className="bre-input"
        style={{ width: 150 }}
        placeholder={t.matchValue}
        value={value}
        onChange={(e) =>
          onChange(match.kind === 'exact' ? { kind: 'exact', id: e.target.value } : { kind: 'pattern', pattern: e.target.value })
        }
      />
    </>
  );
}

function SpriteRow({ rule, t, onChange, onRemove }: { rule: SpriteRule; t: UiStrings; onChange: (r: SpriteRule) => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <MatchEditor match={rule.match} t={t} onChange={(match) => onChange({ ...rule, match })} />
      <select
        className="bre-input"
        aria-label={t.spriteLabel}
        value={rule.sprite}
        onChange={(e) => onChange({ ...rule, sprite: e.target.value as SpriteId })}
      >
        {SPRITE_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        className="bre-input"
        style={{ width: 120 }}
        placeholder={t.displayNameLabel}
        value={rule.displayName ?? ''}
        onChange={(e) => onChange({ ...rule, displayName: e.target.value || undefined })}
      />
      <button className="bre-addbtn" onClick={onRemove} aria-label={t.remove}>✕</button>
    </div>
  );
}

function WindowRow({ rule, t, onChange, onRemove }: { rule: WindowRule; t: UiStrings; onChange: (r: WindowRule) => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <MatchEditor match={rule.match} t={t} onChange={(match) => onChange({ ...rule, match })} />
      <input
        className="bre-input"
        style={{ width: 120 }}
        type="number"
        min={1}
        aria-label={t.windowLabel}
        value={rule.contextWindow}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (n > 0) onChange({ ...rule, contextWindow: n });
        }}
      />
      <span style={{ opacity: 0.6, fontSize: 12 }}>{t.windowLabel}</span>
      <button className="bre-addbtn" onClick={onRemove} aria-label={t.remove}>✕</button>
    </div>
  );
}

function ModelJsonEditor({ models, setModels, t }: { models: ModelConfig; setModels: (c: ModelConfig) => void; t: UiStrings }) {
  const [text, setText] = useState(() => JSON.stringify(models, null, 2));
  const [error, setError] = useState<string | undefined>();
  const focused = useRef(false);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Gdy rejestr zmieni się z panelu, odśwież textarea — ale nie podczas pisania.
  useEffect(() => {
    if (focused.current) return;
    setText(JSON.stringify(models, null, 2));
    setError(undefined);
  }, [models]);

  useEffect(() => () => clearTimeout(applyTimer.current), []);

  const onChange = (v: string) => {
    setText(v);
    let parsed: unknown;
    try {
      parsed = JSON.parse(v);
    } catch {
      setError(t.jsonInvalid);
      return;
    }
    const res = validateModelConfig(parsed);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(undefined);
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => setModels(res.config), 400);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ opacity: 0.7 }}>{`{ } ${t.jsonSynced}`}</span>
        {error && <span style={{ color: '#e24b4a' }}>{error}</span>}
      </div>
      <textarea
        className={`bre-json${error ? ' invalid' : ''}`}
        value={text}
        spellCheck={false}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
