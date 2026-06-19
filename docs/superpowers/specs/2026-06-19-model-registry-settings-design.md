# Rejestr modeli — zakładka ustawień (okno kontekstu + sprite + nazwa)

Data: 2026-06-19
Status: zatwierdzony projekt (przed planem implementacji)

## 1. Problem

Pasek okna kontekstu (gałąź `feat/context-bar-and-scroll`, jeszcze nie na `main`)
dzieli bieżący rozmiar kontekstu (`HeroSnapshot.contextTokens`) przez **sztywno
założone** okno z funkcji `context-bar.ts`:

```ts
export function contextWindow(model?: string): number {
  if (model && /1m|\[1m\]/i.test(model)) return 1_000_000;
  return 200_000;
}
```

To jest błędne: różne modele mają różne okna, a w Claude Code użytkownicy
uruchamiają też modele spoza Claude (Codex/GPT, Gemini, **Ollama**, custom),
których ta funkcja w ogóle nie rozpoznaje. Druga, pokrewna wiedza zaszyta w kodzie
to dobór sprite'a bohatera po podciągu nazwy w `archetype.ts` — nieznany model
zawsze ląduje jako `sonnet-default`.

## 2. Cel

Jeden **edytowalny rejestr metadanych modeli** — bliźniak istniejącego
`MappingConfig` (narzędzie→budynek). Zastępuje dwa rozsiane miejsca z
zahardkodowaną wiedzą o modelu i daje użytkownikowi pełną kontrolę przez panel
ustawień oraz przez zapis/wgranie JSON (jak sekcja budynków).

Per model konfigurowalne:
- **okno kontekstu** (mianownik paska),
- **sprite** („duch" — którego bohatera renderuje model; z bieżącej puli),
- **nazwa wyświetlana** (zamiast surowego stringa id w UI).

## 3. Kluczowa decyzja projektowa: dwie osie, nie jedna reguła

Tożsamość i pojemność modelu to **różne pytania z różnym dopasowaniem**:

- **Tożsamość (sprite + nazwa):** „opus 4.8 to opus 4.8" — niezależnie od `[1m]`.
  Dopasowanie po **bazowym modelu**; tag `[1m]` jest tu bez znaczenia.
- **Pojemność (okno kontekstu):** **presety** „który model ma ile", i **tu** `[1m]`
  ma znaczenie (`opus 4.8` → 200k, `opus 4.8 [1m]` → 1M). Z ręcznym nadpisaniem,
  gdy nie da się rozpoznać w 100%.

Dlatego dwie proste tabele (każda: pierwsze trafienie wygrywa) zamiast jednej
reguły z magią pierwszeństwa. `claude-opus-4-8[1m]` zawiera i `opus`, i `[1m]` —
przy rozdzieleniu osi wychodzi dokładnie pożądane zachowanie bez sztuczek:

```
sprites:  "opus"  → sprite: opus,  nazwa: "Opus 4.8"     (łapie też ...[1m])
windows:  "[1m]"  → 1 000 000      (wyżej na liście → bije presety bazowe)
          "opus"  → 200 000
fallback: { sprite: sonnet, contextWindow: 200 000 }

claude-opus-4-8      → sprite opus / okno 200k
claude-opus-4-8[1m]  → sprite opus / okno 1M       ← tożsamość stała, pojemność inna
llama3.1:8b (Ollama) → sprite fallback / okno fallback  → użytkownik dopisuje wiersz
```

`fallback.sprite` zastępuje sztywny `ARCHETYPE_FALLBACK = 'sonnet-default'`, więc
nawet „domyślny nieznany" model jest konfigurowalny.

## 4. Model danych (`packages/shared/src/index.ts`)

Kanoniczne w `shared`, bo serwer waliduje przy zapisie, a klient używa przy
renderze — dokładnie jak `MappingConfig`.

```ts
// Pula dostępnych sprite'ów — JEDNO źródło prawdy. Klient (archetype.ts)
// importuje to zamiast lokalnej listy MODELS.
export const SPRITE_IDS = ['opus', 'sonnet', 'haiku', 'fable'] as const;
export type SpriteId = (typeof SPRITE_IDS)[number];

// Dopasowanie wpisu do stringa modelu w runtime.
export type ModelMatch =
  | { kind: 'exact'; id: string }         // pełna równość (case-insensitive)
  | { kind: 'pattern'; pattern: string }; // podciąg (case-insensitive)

export interface SpriteRule {   // oś tożsamości — ignoruje [1m]
  match: ModelMatch;
  sprite: SpriteId;
  displayName?: string;
}

export interface WindowRule {   // oś pojemności — [1m] ma znaczenie
  match: ModelMatch;
  contextWindow: number;        // tokeny, > 0
}

export interface ModelConfig {
  sprites: SpriteRule[];        // pierwsze trafienie → sprite + nazwa; inaczej fallback.sprite
  windows: WindowRule[];        // pierwsze trafienie → okno;          inaczej fallback.contextWindow
  fallback: { sprite: SpriteId; contextWindow: number };
}

export interface ResolvedModel {
  sprite: SpriteId;
  displayName?: string;
  contextWindow: number;
}
```

### Dopasowanie i rozstrzyganie

`matchModel(model, match)`:
- `exact`: `model.toLowerCase() === match.id.toLowerCase()`,
- `pattern`: `model.toLowerCase().includes(match.pattern.toLowerCase())`.

`resolveSprite(model, cfg) → { sprite, displayName }`: pierwszy `sprites[]`,
którego `match` trafia; inaczej `{ sprite: cfg.fallback.sprite }`. `undefined`
model → fallback.

`resolveContextWindow(model, cfg) → number`: pierwszy `windows[]`, którego `match`
trafia; inaczej `cfg.fallback.contextWindow`.

`resolveModel(model, cfg) → ResolvedModel`: złączenie obu (jedno przejście dla
wygody konsumentów).

**Kolejność = priorytet** (pierwsze trafienie wygrywa). Kolejność edytuje się w
JSON-ie i przyciskami dodaj/usuń; reorder drag&drop poza zakresem v1.

### Walidacja

`validateModelConfig(input) → { ok: true; config } | { ok: false; error }`
(komunikaty po polsku, wzór `validateMapping`):
- `sprites`, `windows` muszą być tablicami; `fallback` obiektem,
- `fallback.sprite` ∈ `SPRITE_IDS`, `fallback.contextWindow` liczba > 0,
- każda `SpriteRule`: poprawny `match` (kind `exact`/`pattern`, niepuste pole),
  `sprite` ∈ `SPRITE_IDS`, `displayName` opcjonalny string,
- każda `WindowRule`: poprawny `match`, `contextWindow` liczba > 0,
- buduje **czysty** config tylko ze znanych pól (nadmiarowe klucze z klienta nie
  trafiają do pliku — jak w `validateMapping`).

### Wartości domyślne

`DEFAULT_MODEL_CONFIG` odtwarza dzisiejsze zachowanie + poprawne presety Claude.
Okna modeli Claude pobrać z **referencji claude-api** (dokładne, nie zgadywane;
skill `claude-api` na etapie implementacji). Szkic:

```ts
sprites: [
  { match: { kind: 'pattern', pattern: 'opus' },   sprite: 'opus',   displayName: 'Opus 4.8' },
  { match: { kind: 'pattern', pattern: 'sonnet' }, sprite: 'sonnet', displayName: 'Sonnet 4.6' },
  { match: { kind: 'pattern', pattern: 'haiku' },  sprite: 'haiku',  displayName: 'Haiku 4.5' },
  { match: { kind: 'pattern', pattern: 'fable' },  sprite: 'fable',  displayName: 'Fable 5' },
],
windows: [
  { match: { kind: 'pattern', pattern: '[1m]' }, contextWindow: 1_000_000 }, // tag 1M bije bazowe
  { match: { kind: 'pattern', pattern: 'opus' },   contextWindow: 200_000 },
  { match: { kind: 'pattern', pattern: 'sonnet' }, contextWindow: 200_000 },
  { match: { kind: 'pattern', pattern: 'haiku' },  contextWindow: 200_000 },
  // (dokładne wartości z claude-api; nie-Claude lądują na fallbacku)
],
fallback: { sprite: 'sonnet', contextWindow: 200_000 },
```

Konsekwencja: po merge'u nic się nie zmienia wizualnie, dopóki użytkownik nie
edytuje — żadnej regresji.

## 5. Serwer — persystencja + routes (bliźniak budynków)

`packages/server/src/model-config.ts` (kopia `mapping-config.ts`):
- `defaultModelConfigPath()` → `~/.age-of-agents/model-config.json`,
- `loadModelConfig(path?)` — cache po ścieżce; brak/zły plik → `DEFAULT_MODEL_CONFIG`,
- `saveModelConfig(config, path?)` — walidacja + atomowy zapis (temp + rename),
- `invalidateModelConfigCache()`.

`packages/server/src/model-routes.ts` (kopia `mapping-routes.ts`):
- `GET /model-config` → `loadModelConfig()` (lub `DEFAULT_MODEL_CONFIG` w demo),
- `PUT /model-config` → waliduje, zapisuje gdy `persist`, zwraca config lub 400.
- **Różnica względem budynków:** brak konsumenta serwerowego (okno używane tylko
  na kliencie) → **bez** `onSaved`/invalidacji statystyk. PUT po prostu zapisuje.

Rejestracja w `server.ts` w obu trybach (demo `persist:false`, realny `persist:true`),
analogicznie do `registerMappingRoutes`.

## 6. Klient — store + hydrate (bliźniak `mapping-store.ts`)

`packages/client/src/model-store.ts`:
- `useModels` (Zustand): `models: ModelConfig`, `modelsLoaded: boolean`,
  `setModels(cfg)` (optymistycznie: stan + localStorage `age-of-agents.models` +
  `PUT /model-config` w tle), `resetModels()`, `hydrate()` (`GET /model-config`),
- `readCache`/`writeCache` strażowane `typeof` (działa też w node/testach),
- `resolveModelLive(model) → ResolvedModel` — wrapper `resolveModel(model,
  useModels.getState().models)` dla konsumentów spoza Reacta (jak
  `resolveBuildingLive`).

`main.tsx`: dodać `useModels.getState().hydrate()` obok istniejącego `hydrate()`
mapy.

Re-eksport w `theme/` (jak `theme/mapping.ts`) dla spójności importów klienta.

## 7. Wpięcie i reaktywność (live update)

**Wymóg:** po edycji rejestru w ustawieniach panel sesji (karta bohatera w
`SidePanel`, gdzie renderowany jest `ContextBar`) musi pokazać poprawne okno i
przeliczyć pasek **natychmiast, bez przeładowania**. Decyduje o tym rozróżnienie
ścieżek:

- **Ścieżka React (panel sesji)** — komponent **subskrybuje** store hakiem
  `useModels((s) => s.models)`; edycja rejestru → update store → re-render.
  (NIE `getState` — to nie wywołuje re-renderu.)
- **Ścieżka spoza Reacta (ticker gry)** — `resolveModelLive` przez `getState`,
  odczyt co klatkę, więc też łapie zmianę od razu.

Trzy punkty styku:

1. **Okno kontekstu (panel sesji)** — `SidePanel` subskrybuje
   `const models = useModels((s) => s.models)`, liczy
   `resolveContextWindow(hero.model, models)` i przekazuje wynik do `ContextBar`
   jako **prop `windowSize`**. `ContextBar` staje się **czysty** (dostaje `tokens`
   + `windowSize`, liczy `pct`/kolor/segmenty) — bez couplingu z modelem.
   `contextWindow(model)` znika z `context-bar.ts` (logika okna → `resolveContextWindow`
   w shared); `context-bar.test.ts` aktualizujemy/przenosimy do testów `resolveModel`.
   Skutek: zmiana okna danego modelu **od razu** przelicza mianownik i %.
2. **Nazwa (panel sesji)** — `SidePanel` z tego samego `models`:
   `resolveModel(hero.model, models).displayName ?? hero.model ?? t.modelUnknown`
   ([`SidePanel.tsx:130`](../../../packages/client/src/hud/SidePanel.tsx)).
   Reaktywne tym samym hakiem.
3. **Sprite (ticker gry)** — jedyne wywołanie
   [`view.ts:435`](../../../packages/client/src/game/view.ts):
   `getHeroSheet(sessionToArchetypeKey(hero, resolveModelLive(hero.model).sprite))`.
   `sessionToArchetypeKey(hero, spriteOverride?: SpriteId)` — gdy `spriteOverride`
   podany (ścieżka realna), używa go jako część „model" klucza; bez override
   zostaje dotychczasowa logika podciągu (zgodność wsteczna/testy). `MODELS` w
   `archetype.ts` → import `SPRITE_IDS` z shared (jedno źródło prawdy).

## 8. UI — zakładki + edytor rejestru

`SettingsPanel.tsx`: dodać pasek zakładek (`activeTab`): **Reakcje budynków** |
**Modele**. Tytuł i renderowanie zależne od `activeTab`. Stylowanie: nowa klasa
`.settings-tabs-nav` (płaskie przyciski, dolna krawędź na aktywnej), reszta z
istniejącego chrome `.hud-panel` + `hud.css`.

`packages/client/src/hud/ModelRegistryEditor.tsx` (bliźniak
`BuildingReactionsEditor.tsx`):
- **Dwie sekcje** odpowiadające osiom: „Sprite i nazwa" (`sprites[]`) oraz „Okno
  kontekstu" (`windows[]`); pod każdą wiersze edytowalne:
  - dopasowanie: select kind (`exact`/`pattern`) + input wartości,
  - sprites: dropdown sprite (`SPRITE_IDS`) + input nazwy,
  - windows: input liczbowy okna,
  - przyciski dodaj/usuń wiersz; pola `fallback.sprite` (dropdown) +
    `fallback.contextWindow` (liczba),
- **„Widziane modele"** (odpowiednik paska coverage budynków): lista odrębnych
  `hero.model` z bieżących sesji (ze store świata) z rozwiązanym sprite'em/oknem i
  flagą „→ fallback", żeby od razu widać było model wymagający konfiguracji.
  **Wersja prosta — bez podglądu bieżącego %** (pokazujemy dopasowanie:
  sprite / okno / fallback, nie zużycie),
- **edytor JSON** (textarea, debounce 400ms, `validateModelConfig`, czerwona
  ramka + komunikat na błędzie) — zapis/wgranie JSON jak w sekcji budynków,
- przycisk „Przywróć domyślne" (`resetModels`).

`i18n.ts`: nowe klucze do `UiStrings` + tłumaczenia EN/PL/IT (wzorzec potwierdzony
— `context` dodano tak samo). M.in.: `models`, `tabBuildingReactions`, `tabModels`,
`spriteAndName`, `contextWindowSection`, `seenModels`, `usesFallback`,
`matchExact`, `matchPattern`, `fallbackLabel`, plus istniejące `restoreDefaults`,
`jsonSynced`, `jsonInvalid`.

## 9. Kolejność wdrożenia i release

- **Krok 0 — merge `feat/context-bar-and-scroll` → `main`.** Baza merge'a = HEAD
  maina (`c4250d5`), zero konfliktów (praktycznie fast-forward). Wnosi pasek
  kontekstu (`contextTokens`), scroll Arsenału, bump pliku do 0.3.5. **Bez
  publikacji** (publish.yml odpala tag `v*`).
- **Krok 1 — shared:** `SPRITE_IDS`, `ModelMatch`, `SpriteRule`, `WindowRule`,
  `ModelConfig`, `resolveSprite`/`resolveContextWindow`/`resolveModel`,
  `validateModelConfig`, `DEFAULT_MODEL_CONFIG` (+ testy).
- **Krok 2 — serwer:** `model-config.ts`, `model-routes.ts`, rejestracja w
  `server.ts` (+ testy Fastify `inject`).
- **Krok 3 — klient store:** `model-store.ts`, `hydrate` w `main.tsx`,
  re-eksport (+ testy).
- **Krok 4 — wpięcie:** context-bar, archetype/view, SidePanel.
- **Krok 5 — UI:** zakładki w `SettingsPanel`, `ModelRegistryEditor`, i18n.
- **Krok 6 — jakość:** testy, build, lint.
- **Release:** **jeden tag `v0.3.6`** (bump 0.3.5 → 0.3.6) z całością — userzy od
  razu widzą poprawne okna, nigdy przejściowo zgrubnych.

## 10. Testy

- `shared`: `resolveSprite`/`resolveContextWindow`/`resolveModel` — `[1m]` bije
  `opus` w oknie, ale sprite stały na `opus`; fallback dla nieznanych; case-insensitive;
  `validateModelConfig` (zły sprite/okno/match → błąd; czysty config bez
  nadmiarowych pól).
- `server`: GET zwraca DEFAULT przy braku pliku; PUT zapisuje i oddaje; zły payload
  → 400; round-trip przez tmp-plik.
- `client`: `setModels` optymistyczny (stan + cache) bez DOM; `hydrate` zaciąga z
  serwera; `resolveModelLive` czyta store.
- aktualizacja `context-bar.test.ts` (logika okna przeniesiona).
- **Weryfikacja na żywo (preview)** — kryterium akceptacji reaktywności:
  uruchom aplikację, w ustawieniach zmień okno modelu obecnej sesji → pasek w
  `SidePanel` **od razu** przelicza mianownik i % (bez reloadu); zmień
  sprite/nazwę → bohater na mapie i etykieta w panelu aktualizują się. To samo po
  wgraniu JSON-a.

## 11. Świadomie poza zakresem (YAGNI)

Kolor per model (dziś paleta rotacyjna, niezależna od modelu), max output, reorder
drag&drop w UI, auto-pobieranie okien z API dostawcy, alerty „blisko limitu",
warianty sprite'ów per permission-mode (osobna Faza).
