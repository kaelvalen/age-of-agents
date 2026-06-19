# Pasek kontekstu + scroll Arsenału — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać per-bohater pasek zużycia okna kontekstu w SidePanel (zielony→żółty→czerwony, pixel) oraz dopracować scroll Arsenału (sticky nagłówki sekcji + pixel-scrollbar).

**Architecture:** Serwer wystawia BIEŻĄCY rozmiar kontekstu (`HeroSnapshot.contextTokens` = input+cache_read+cache_creation z ostatniej wiadomości, NIE suma). Klient liczy `%` względem okna modelu (czyste funkcje w `context-bar.ts`) i renderuje segmentowany pixel-pasek (`ContextBar.tsx`) w SidePanel. Scroll Arsenału: sticky nagłówki sekcji + stylizowany scrollbar.

**Tech Stack:** TypeScript (ESM/NodeNext), Node, Vitest, React 19 + zustand, monorepo npm workspaces.

**Spec:** `docs/superpowers/specs/2026-06-17-context-bar-and-arsenal-scroll-design.md`
**Beads:** `AgeOfAgents-kfr`
**Branch:** `feat/context-bar-and-scroll` (na bazie main @ 7fe074a, już aktywny w tym worktree)

---

## File Structure

| Plik | Rola | Akcja |
|---|---|---|
| `packages/shared/src/index.ts` | `HeroSnapshot.contextTokens?` | Modify |
| `packages/server/src/transcript/facts.ts` | `usage` fakt + `context?` | Modify |
| `packages/server/src/transcript/parser.ts` | policz `context` w `usage` | Modify |
| `packages/server/src/state-machine.ts` | `contextTokens` (najnowszy) na bohaterze | Modify |
| `packages/client/src/hud/context-bar.ts` | `contextWindow`/`contextPct`/`contextColor` | Create |
| `packages/client/src/hud/ContextBar.tsx` | segmentowany pixel-pasek | Create |
| `packages/client/src/hud/SidePanel.tsx` | render `<ContextBar>` pod kafelkami | Modify |
| `packages/client/src/hud/ArchitectHall.tsx` | sticky nagłówki sekcji + klasa scrolla | Modify |
| `packages/client/src/hud/hud.css` | pixel-scrollbar Arsenału | Modify |
| `packages/client/src/i18n.ts` | klucz `context` (3 języki) | Modify |
| `packages/server/test/parser.test.ts` | test `context` | Modify |
| `packages/server/test/state-machine.test.ts` | test `contextTokens` | Modify |
| `packages/client/tests/context-bar.test.ts` | testy logiki paska | Create |

**Komendy** (z `/Users/mpawelczuk/RTS agents/.claude/worktrees/cool-booth-6d1097`):
- Test serwera: `npm run test -w @agent-citadel/server -- <pattern>`
- Test klienta: `npm run test -w @agent-citadel/client -- <pattern>`
- Typecheck klienta: `npx tsc --noEmit -p packages/client`
- Typecheck serwera: `npm run build -w @agent-citadel/server` (powinien być CZYSTY — main naprawił opencode)
- Pełne testy: `npm test`

ESM: importy z rozszerzeniem `.js`. Testy Vitest, nazwy `it()` po polsku.

---

## Task 1: `contextTokens` w HeroSnapshot (shared)

**Files:** Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Dodaj pole**

W interfejsie `HeroSnapshot`, tuż przed `wielded?` (oba to świeże pola; trzymaj razem):
```ts
  /** Bieżący rozmiar kontekstu z OSTATNIEJ wiadomości (input + cache_read + cache_creation).
   *  ≠ tokens.input (suma kumulatywna). Brak → nie pokazuj paska kontekstu. */
  contextTokens?: number;
```

- [ ] **Step 2: Typecheck**

Run: `npm run build -w @agent-citadel/shared`
Expected: PASS (czysto).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): HeroSnapshot.contextTokens (bieżący rozmiar kontekstu) (AgeOfAgents-kfr)"
```

---

## Task 2: `context` w usage (parser + facts)

**Files:** Modify `packages/server/src/transcript/facts.ts`, `packages/server/src/transcript/parser.ts`, `packages/server/test/parser.test.ts`

- [ ] **Step 1: Rozszerz `Fact` usage**

W `facts.ts`, wariant `usage`:
```ts
  | { kind: 'usage'; messageId: string; input: number; output: number; context?: number }
```

- [ ] **Step 2: Napisz failing test** (dopisz w `parser.test.ts`)

```ts
  it('liczy context z usage (input + cache_read + cache_creation)', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-17T10:00:00.000Z',
      message: {
        id: 'mctx',
        usage: { input_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 900, output_tokens: 50 },
        content: [],
      },
    });
    const usage = interpretLine(line).find((f) => f.kind === 'usage');
    expect(usage).toMatchObject({ kind: 'usage', input: 5100, output: 50, context: 6000 });
  });
```

- [ ] **Step 3: Uruchom — ma FAILOWAĆ**

Run: `npm run test -w @agent-citadel/server -- parser`
Expected: FAIL (brak `context` w fakcie).

- [ ] **Step 4: Implementacja w `parser.ts`**

W gałęzi `assistant`, w bloku tworzącym fakt `usage` (obok `input`/`output`), dodaj pole `context`:
```ts
        facts.push({
          kind: 'usage',
          messageId,
          input: Number(usage.input_tokens ?? 0) + Number(usage.cache_read_input_tokens ?? 0),
          output: Number(usage.output_tokens ?? 0),
          context:
            Number(usage.input_tokens ?? 0) +
            Number(usage.cache_read_input_tokens ?? 0) +
            Number(usage.cache_creation_input_tokens ?? 0),
        });
```

- [ ] **Step 5: Uruchom — ma PRZEJŚĆ**

Run: `npm run test -w @agent-citadel/server -- parser`
Expected: PASS (wszystkie testy parsera).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/transcript/facts.ts packages/server/src/transcript/parser.ts packages/server/test/parser.test.ts
git commit -m "feat(context): usage niesie bieżący rozmiar kontekstu (AgeOfAgents-kfr)"
```

---

## Task 3: `contextTokens` w SessionTracker

**Files:** Modify `packages/server/src/state-machine.ts`, `packages/server/test/state-machine.test.ts`

- [ ] **Step 1: Napisz failing test** (dopisz w `state-machine.test.ts`; dopasuj importy `World`/`SessionTracker` do nagłówka pliku)

```ts
  it('contextTokens = kontekst NAJNOWSZEJ wiadomości (nie suma)', () => {
    const world = new World();
    const tracker = new SessionTracker(world, 'sCtx', 'PD');
    tracker.apply({ kind: 'usage', messageId: 'm1', input: 10, output: 1, context: 1000 });
    tracker.apply({ kind: 'usage', messageId: 'm2', input: 10, output: 1, context: 1800 });
    expect(world.getHero('sCtx')!.contextTokens).toBe(1800);
  });
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `npm run test -w @agent-citadel/server -- state-machine`
Expected: FAIL (`contextTokens` undefined).

- [ ] **Step 3: Implementacja w `state-machine.ts`**

a) Pole prywatne (obok `private _tokens`):
```ts
  private contextTokens?: number;
```

b) W builderze `hero()` dodaj do zwracanego obiektu (obok `wielded: this.wielded(),`):
```ts
      contextTokens: this.contextTokens,
```

c) W `case 'usage':`, wewnątrz bloku `if (!this.seenUsage.has(fact.messageId)) { ... }`, po ustawieniu `this._tokens`, dodaj ustawienie najnowszego kontekstu i dołóż go do `patch`:
```ts
          if (typeof fact.context === 'number') this.contextTokens = fact.context;
          this.patch({ tokens: this._tokens, ...(typeof fact.context === 'number' ? { contextTokens: fact.context } : {}) });
```
(zastępując dotychczasowe `this.patch({ tokens: this._tokens });`).

- [ ] **Step 4: Uruchom — ma PRZEJŚĆ**

Run: `npm run test -w @agent-citadel/server -- state-machine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/state-machine.ts packages/server/test/state-machine.test.ts
git commit -m "feat(context): contextTokens (najnowszy) na bohaterze (AgeOfAgents-kfr)"
```

---

## Task 4: Logika paska (klient, czyste funkcje)

**Files:** Create `packages/client/src/hud/context-bar.ts`, `packages/client/tests/context-bar.test.ts`

- [ ] **Step 1: Napisz failing test**

```ts
import { describe, expect, it } from 'vitest';
import { contextWindow, contextPct, contextColor } from '../src/hud/context-bar';

describe('context-bar', () => {
  it('contextWindow: default 200k, 1M dla modeli z oknem 1M', () => {
    expect(contextWindow()).toBe(200_000);
    expect(contextWindow('claude-opus-4-8')).toBe(200_000);
    expect(contextWindow('claude-sonnet-4-6[1m]')).toBe(1_000_000);
  });
  it('contextPct: zaokrągla i clampuje do 100', () => {
    expect(contextPct(20_000)).toBe(10);
    expect(contextPct(74_000)).toBe(37);
    expect(contextPct(999_999)).toBe(100);
  });
  it('contextColor: progi zielony/żółty/pomarańcz/czerwień', () => {
    expect(contextColor(8)).toBe('#5dcaa5');
    expect(contextColor(38)).toBe('#f0d76e');
    expect(contextColor(64)).toBe('#f0b56e');
    expect(contextColor(90)).toBe('#ef7a6a');
    expect(contextColor(92)).toBe('#e24b4a');
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `npm run test -w @agent-citadel/client -- context-bar`
Expected: FAIL (brak modułu).

- [ ] **Step 3: Implementacja `context-bar.ts`**

```ts
/** Okno kontekstu modelu w tokenach. Default 200k; 1M dla modeli z dużym oknem. */
export function contextWindow(model?: string): number {
  if (model && /1m|\[1m\]/i.test(model)) return 1_000_000;
  return 200_000;
}

/** Procent zapełnienia okna kontekstu, 0..100 (zaokrąglony, clamp). */
export function contextPct(tokens: number, model?: string): number {
  return Math.min(100, Math.round((tokens / contextWindow(model)) * 100));
}

/** Kolor wypełnienia wg %: zielony ≤10 → żółty ≤50 → ku czerwieni do 100. */
export function contextColor(pct: number): string {
  if (pct <= 10) return '#5dcaa5';
  if (pct <= 50) return '#f0d76e';
  if (pct <= 75) return '#f0b56e';
  if (pct <= 90) return '#ef7a6a';
  return '#e24b4a';
}
```

- [ ] **Step 4: Uruchom — ma PRZEJŚĆ**

Run: `npm run test -w @agent-citadel/client -- context-bar`
Expected: PASS (3 testy).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hud/context-bar.ts packages/client/tests/context-bar.test.ts
git commit -m "feat(context): logika paska (window/pct/color) (AgeOfAgents-kfr)"
```

---

## Task 5: Komponent `ContextBar` + SidePanel + i18n

**Files:** Create `packages/client/src/hud/ContextBar.tsx`; Modify `packages/client/src/hud/SidePanel.tsx`, `packages/client/src/i18n.ts`

- [ ] **Step 1: Utwórz `ContextBar.tsx`**

```tsx
import { formatK } from '../util';
import { contextPct, contextColor, contextWindow } from './context-bar';

const SEGMENTS = 24;

/** Segmentowany pixel-pasek zapełnienia okna kontekstu (per-bohater). */
export function ContextBar({ tokens, model, label }: { tokens: number; model?: string; label: string }) {
  const pct = contextPct(tokens, model);
  const c = contextColor(pct);
  const filled = Math.round((SEGMENTS * pct) / 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7, marginBottom: 5 }}>
        <span className="px" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span>
          <span style={{ color: c }}>{pct}%</span> · {formatK(tokens)} / {formatK(contextWindow(model))}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 12,
              background: i < filled ? c : '#2a2926',
              boxShadow: 'inset 1px 1px 0 #ffffff22, inset -1px -1px 0 #00000055',
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Dodaj klucz i18n `context`**

W `packages/client/src/i18n.ts`:
- `UiStrings` (obok `usedThisSession`/`scanningProject`): `context: string;`
- EN: `context: 'Context',`
- PL: `context: 'Kontekst',`
- IT: `context: 'Contesto',`

- [ ] **Step 3: Wepnij w `SidePanel.tsx`**

Import na górze:
```ts
import { ContextBar } from './ContextBar';
```
Tuż po siatce kafelków (zamykające `</div>` bloku `display: 'grid'` z `StatTile`), dodaj:
```tsx
      {typeof hero.contextTokens === 'number' && (
        <ContextBar tokens={hero.contextTokens} model={hero.model} label={t.context} />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p packages/client`
Expected: PASS (i18n komplet, komponent typuje się).

- [ ] **Step 5: Pełne testy klienta (regresja)**

Run: `npm run test -w @agent-citadel/client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/hud/ContextBar.tsx packages/client/src/hud/SidePanel.tsx packages/client/src/i18n.ts
git commit -m "feat(context): pasek kontekstu w SidePanel (AgeOfAgents-kfr)"
```

---

## Task 6: Sticky scroll Arsenału + pixel-scrollbar

**Files:** Modify `packages/client/src/hud/ArchitectHall.tsx`, `packages/client/src/hud/hud.css`

- [ ] **Step 1: Sticky nagłówki sekcji + klasa scrolla w `ArchitectHall.tsx`**

a) W `Body`, na scrollowanym divie dodaj klasę `arsenal-scroll`:
```tsx
    <div className="arsenal-scroll" style={{ overflowY: 'auto', flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
```

b) W `Section`, na przycisku-nagłówku dodaj sticky (do istniejącego inline `style`): `position: 'sticky', top: 0, zIndex: 1`. Pełny `style` przycisku:
```tsx
        style={{ position: 'sticky', top: 0, zIndex: 1, width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: '#45443f', color: '#f1efe8', border: 'none', padding: '6px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'Pixelify Sans, system-ui, sans-serif', textShadow: '1px 1px 0 #000' }}
```

- [ ] **Step 2: Pixel-scrollbar w `hud.css`**

Dodaj na końcu pliku:
```css
.arsenal-scroll::-webkit-scrollbar { width: 8px; }
.arsenal-scroll::-webkit-scrollbar-track { background: #2a2926; }
.arsenal-scroll::-webkit-scrollbar-thumb { background: #45443f; box-shadow: inset 1px 1px 0 #5a5952, inset -1px -1px 0 #15140f; }
.arsenal-scroll::-webkit-scrollbar-thumb:hover { background: #5a5952; }
.arsenal-scroll { scrollbar-width: thin; scrollbar-color: #45443f #2a2926; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p packages/client`
Expected: PASS.

- [ ] **Step 4: Weryfikacja wizualna (preview)** — wykonuje kontroler

Uruchom `client` (port 5173), wstrzyknij arsenał z wieloma skillami (>15) i sesję z `contextTokens`, sprawdź: (a) Arsenał przewija się, nagłówki sekcji zostają na górze, scrollbar w stylu HUD; (b) SidePanel pokazuje pasek kontekstu w odpowiednim kolorze. Brak błędów w konsoli.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/hud/ArchitectHall.tsx packages/client/src/hud/hud.css
git commit -m "feat(arsenal): sticky nagłówki sekcji + pixel-scrollbar (AgeOfAgents-kfr)"
```

---

## Definition of Done

- [ ] SidePanel pokazuje pasek zużycia kontekstu (per-bohater) gdy `contextTokens` znane; kolor wg % (zielony→czerwony); ukryty dla agentów bez telemetrii.
- [ ] Arsenał przewija się czysto przy wielu elementach; nagłówki sekcji sticky; pixel-scrollbar.
- [ ] `npm test` zielone; `npx tsc --noEmit -p packages/client` zielone; `npm run build -w @agent-citadel/server` zielone.
- [ ] Zweryfikowane wizualnie (preview).
- [ ] `bd close AgeOfAgents-kfr` po scaleniu.
