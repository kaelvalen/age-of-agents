# Design: panel ustawień + edytowalne reakcje budynków na narzędzia

Data: 2026-06-17
Status: zatwierdzony do planowania
Gałąź: `feat/settings-building-reactions` (na bazie `main` @ v0.3.1)

## Cel

Wystawić „z frontu" do edycji **konfigurację sterującą ruchem** — czyli mapowanie
`narzędzie z żywego logu → budynek-cel`. Dziś to zahardkodowana tabela w kodzie
(`toolToBuilding` w `@agent-citadel/shared`). Po zmianie użytkownik edytuje ją w
**panelu ustawień** (trybik obok języka): per budynek widzi jego **obrazek** i
listę **wyzwalaczy** (elementów logu, na które reaguje), może je dodawać/usuwać
(wpisywane po `,` lub `;`), a pod spodem ma ustrukturyzowany **JSON** zsynchronizowany
z panelem. Panel od razu pokazuje **pokrycie** (które narzędzia spadają do Twierdzy,
które budynki bez wyzwalaczy, konflikty).

Wartość: metafora gry przestaje być „magią w kodzie" — staje się czytelną,
edytowalną konfiguracją, którą user dostraja do swojego stylu pracy.

## Stan wyjściowy (co już jest)

- **Serce metafory:** `toolToBuilding(tool, detail)` w
  `packages/shared/src/index.ts:258` — płaska `TOOL_BUILDING: Record<string, BuildingId>`
  + 2 reguły specjalne: `Bash` gdy `detail` pasuje do `/\bgit\s+(commit|push|pull|merge|rebase)\b/`
  → `market`; prefiks `mcp__` → `guild`; fallback → `citadel`. Funkcja **czysta i synchroniczna**.
- **4 konsumenci tej samej funkcji** (klient i serwer):
  1. `packages/client/src/game/view.ts:658` — `steer()`: jednostka idzie do budynku swojego
     narzędzia (**to jest „ruch"**). Zapamiętuje `lastBuilding` (warsztat).
  2. `packages/client/src/hud/BuildingPanel.tsx:52,55,64` — „kto tu teraz pracuje" + ostatnie akcje.
  3. `packages/client/src/hud/SidePanel.tsx:103,195` — odznaka budynku przy akcji.
  4. `packages/server/src/building-stats.ts:58,103` — atrybucja tokenów wyjściowych do budynku
     (skan transkryptów `~/.claude/projects`, cache 60 s).
- **Re-eksport** dla klienta: `packages/client/src/theme/mapping.ts` re-eksportuje
  `toolToBuilding` z shared (importy `'../theme/mapping'` mają działać dalej).
- **Testy mapowania:** `packages/client/tests/mapping.test.ts` (dokładne nazwy, git, mcp, fallback).
- **Budynki:** `BuildingId` (18 wartości) w shared. W motywach (`theme/fantasy.ts`,
  `theme/scifi.ts`) część budynków to **robocze** (cel narzędzi), część **socjalne**
  (arena/karczma/ogród/bar/świątynia w fantasy; holodeck/mess/hydroponics/lounge/medbay
  w sci-fi) — sterowane STANEM bohatera (idle/myśli/czeka/błąd), nie narzędziem,
  więc celowo NIE są w `TOOL_BUILDING`.
- **Obrazki budynków:** PNG per motyw, ładowane przez `game/building-sprites.ts`
  z `/assets/{theme}/buildings/{id}.png` wg `index.json` (`{ ids: string[] }`).
- **Chrome HUD / język:** `packages/client/src/hud/ThemeSwitch.tsx` — panel lewy-górny
  (`hud-panel`, klasa `ghost`/`px`) z przyciskami motywu, `HooksPanel` i dropdownem języka
  (wzorzec: `useMenuKeyboard`, klik-poza, `Esc`, klasy `hud-dd-menu`/`hud-dd-option`).
- **Ustawienia/store:** `packages/client/src/settings.ts` — zustand `useSettings`
  (`themeId`, `lang`, persystencja w `localStorage`).
- **i18n:** `packages/client/src/i18n.ts` — `interface UiStrings` + obiekty `EN`/`PL`/`IT`,
  hook `useUi()`. Osobno `BUILDINGS` (label+desc budynku per motyw/język) i `buildingText()`.
- **REST na serwerze:** Fastify; istnieje już `GET /building-stats` (wzorzec dla nowych endpointów),
  statyczny serwer klienta, WS na `/ws`.

## Decyzje (potwierdzone z użytkownikiem)

1. **Trwałość = lokalny serwer jako źródło prawdy + optymistyczny cache klienta (hybryda).**
   Serwer jest lokalny (`localhost:8123`, startowany przez CLI usera) → zapis na serwer to
   zapis na własny dysk, nic nie wychodzi na zewnątrz. Plik `~/.age-of-agents/tool-mapping.json`.
   Dzięki temu **atrybucja tokenów (serwer) też honoruje mapę usera**. Klient stosuje zmianę
   natychmiast (store + cache localStorage), `PUT` leci w tle.
2. **Wyrazistość wyzwalaczy = nazwy + wzorzec + warunek.** Odwzorowuje 100% dzisiejszej
   logiki, w tym „ukryte" `market` (warunek git) i `guild` (prefiks `mcp__`).
3. **Edytujemy wyzwalacze ISTNIEJĄCYCH budynków.** Dodawanie *nowych* budynków poza zakresem
   (wymaga sprite'a + miejsca na mapie + i18n).
4. **Panel ma wariant wizualny ORAZ JSON** pod spodem, dwukierunkowo zsynchronizowane.
5. **Coverage liczony i pokazywany** od razu w panelu.

## Architektura

### 4.1 Model danych (shared) — z kodu do danych

W `packages/shared/src/index.ts`:

```ts
export type MappingRule =
  | { kind: 'exact';  tool: string;                    building: BuildingId }
  | { kind: 'prefix'; prefix: string;                  building: BuildingId }
  | { kind: 'detail'; tool: string; pattern: string;   building: BuildingId };

export interface MappingConfig {
  rules: MappingRule[];
  fallback: BuildingId; // domyślnie 'citadel'
}

/** Czysta. Precedencja wg specyficzności: detail → prefix(najdłuższy) → exact → fallback. */
export function resolveBuilding(
  tool: string | undefined,
  detail: string | undefined,
  config: MappingConfig,
): BuildingId;

/** Odtwarza 1:1 dzisiejsze TOOL_BUILDING + reguły git/mcp + fallback citadel. */
export const DEFAULT_MAPPING: MappingConfig;
```

- `toolToBuilding(tool, detail)` zostaje, ale jako cienki wrapper:
  `resolveBuilding(tool, detail, DEFAULT_MAPPING)` → **wszystkie istniejące importy i testy
  działają bez zmian**.
- **Precedencja** (świadoma decyzja, nie kolejność w tablicy):
  1. `detail` — `tool === r.tool` i `new RegExp(r.pattern).test(detail)` (np. Bash+git → market),
  2. `prefix` — `tool.startsWith(r.prefix)`; przy wielu pasujących wygrywa **najdłuższy** prefiks,
  3. `exact` — `tool === r.tool`,
  4. `fallback`.
  To gwarantuje, że specyficzne reguły biją ogólne (Bash+git bije Bash→mine), bez ekspozycji
  „przeciągania kolejności" w UI.
- `shared` pozostaje **czyste** (zero IO): config jest argumentem.
- **Walidacja** (też reużywalna): `validateMapping(json): { ok: true; config } | { ok: false; error }`
  — sprawdza kształt, znane `BuildingId`, poprawność regexów (`pattern`). Używana przez serwer
  (PUT) i klienta (textarea JSON).

### 4.2 Serwer — persystencja + endpointy

`packages/server/src/mapping-config.ts` (nowy):
- Lokalizacja: `join(homedir(), '.age-of-agents', 'tool-mapping.json')`.
- `loadMappingConfig(): Promise<MappingConfig>` — brak pliku/niepoprawny → `DEFAULT_MAPPING`
  (z cache w pamięci + invalidacja po zapisie).
- `saveMappingConfig(config): Promise<void>` — `mkdir -p` katalogu, zapis atomowy (tmp+rename),
  walidacja przez `validateMapping` przed zapisem.

`packages/server/src/server.ts`:
- `GET /tool-mapping` → aktualny `MappingConfig`.
- `PUT /tool-mapping` (body = `MappingConfig`) → waliduje, zapisuje, zwraca zapisany config
  (400 z `error` gdy niepoprawny).

`packages/server/src/building-stats.ts`:
- `computeBuildingStats` ładuje config (raz na przeliczenie) i woła
  `resolveBuilding(name, detail, config)` zamiast `toolToBuilding`. Reszta logiki bez zmian.
  Cache stats (60 s) zostaje; zapis configu invaliduje cache stats, żeby liczby nadążały.

### 4.3 Klient — store + zastosowanie

Nowy store `useMapping` w `packages/client/src/mapping-store.ts` (osobny od `useSettings`,
bo mapa to odrębny koncept niż motyw/język):
- Stan: `mapping: MappingConfig`, `mappingLoaded: boolean`.
- Init: cache z `localStorage('age-of-agents.mapping')` jako wartość startowa (świat renderuje
  poprawnie zanim wróci fetch) → `GET /tool-mapping` nadpisuje i odświeża cache.
- `setMapping(config)` — optymistycznie: ustaw store + zapis do localStorage + `PUT` w tle
  (błąd `PUT` = nieblokujący toast/log; stan UI zostaje).
- `resetMapping()` — `setMapping(DEFAULT_MAPPING)`.

Helper `resolveBuildingLive(tool, detail)` czyta `useMapping.getState().mapping` (wzorzec jak
ticker w `view.ts`, który już czyta `useWorld.getState()`), żeby konsumenci spoza Reacta
(`view.ts`) mieli aktualny config bez couplingu. Cztery call-site'y przechodzą z
`toolToBuilding(...)` na konfigurowalną wersję:
- `view.ts:658` (`steer`) — przez `resolveBuildingLive`.
- `BuildingPanel.tsx`, `SidePanel.tsx` — przez hook (subskrypcja `mapping` ze store, re-render
  przy edycji, żeby panele zgadzały się na żywo).

### 4.4 UI — trybik → modal ustawień

- **Trybik** w `ThemeSwitch.tsx` obok dropdownu języka: `<button class="ghost">⚙</button>`
  (`aria-haspopup="dialog"`), otwiera **modal** (overlay, nie dropdown — potrzebuje obrazków
  + JSON). Zamknięcie: `Esc`, klik-poza, ✕; focus-trap minimalny, wzorzec a11y jak dropdowny.
- Nowy komponent `packages/client/src/hud/SettingsPanel.tsx` (+ sekcje):
  - **Sekcjonowany** (na przyszłość: kalibracja sprite'ów, strojenie atrybucji). Sekcja 1 =
    **Reakcje budynków** (`BuildingReactionsEditor`).
  - **Pasek pokrycia** u góry sekcji (4.5).
  - **Legenda typów** chipów: nazwa (szary) / wzorzec (niebieski) / warunek (bursztyn).
  - **Karta per budynek roboczy**: obrazek z `/assets/{theme}/buildings/{id}.png` (fallback:
    kolorowy placeholder z `placeholderColor`), label z `buildingText`, chipy-wyzwalacze
    (każdy z ✕), input „+ dodaj" parsujący wpis po `,`/`;` na osobne reguły `exact`
    (wzorce/warunki dodawane jawnie — patrz niżej).
  - **Budynki socjalne** w osobnej, wyszarzonej sekcji: „sterowane stanem bohatera — bez
    wyzwalaczy" (informacyjnie, nieedytowalne triggery).
  - **Edycja warunku/wzorca:** chip `detail`/`prefix` rozwijany do mini-formy (narzędzie +
    regex / prefiks). Dodanie nowego: przycisk „+ warunek" / „+ wzorzec" przy karcie.
  - **JSON pod spodem:** `<textarea>` z `JSON.stringify(mapping, null, 2)`. Edycja → debounce →
    `validateMapping`: ok → `setMapping`; błąd → czerwona ramka + komunikat, **stan gry
    nietknięty**. Panel ↔ JSON dwukierunkowo (zmiana chipów regeneruje JSON).
  - **Przywróć domyślne** — `resetMapping()`.

### 4.5 Coverage — „od razu jak pokryte"

Liczone na żywo w panelu (czysta funkcja `computeCoverage(mapping, seenTools): Coverage`,
testowalna):
- **Pokryte budynki robocze** — ile budynków ma ≥1 regułę.
- **Narzędzia → Twierdza (fallback)** — z `seenTools` (zbiór nazw narzędzi widzianych w
  `recentActions` bohaterów + ze strumienia WS sesji) te, dla których `resolveBuilding` daje
  `citadel`, a nie są celowym przypisaniem. Klik „przypisz" → dodaje regułę `exact`.
- **Konflikty** — narzędzie z `seenTools` złapane przez >1 regułę różnych budynków (sygnalizacja;
  realnie precedencja i tak rozstrzyga, ale warto pokazać niejednoznaczność).
- Budynki **socjalne** wykluczone z alarmu „bez wyzwalaczy".

`seenTools` (v1) = klient zbiera unikalne nazwy narzędzi z żywego stanu. (Rozszerzenie/następny
spec: endpoint serwera ze zbiorem narzędzi ze skanu transkryptów — pełniejszy obraz historyczny.)

### 4.6 i18n

Nowe pola w `interface UiStrings` (+ wpisy EN/PL/IT): tytuł ustawień, „Reakcje budynków",
„dodaj wyzwalacz", „warunek/wzorzec/nazwa" (legenda), „pokrycie", „spada do Twierdzy",
„konflikty", „napraw", „budynki socjalne — sterowane stanem", „JSON", „przywróć domyślne",
„budynek/narzędzie". Ton laicki, spójny z istniejącymi opisami.

## Granice jednostek (isolation)

- `shared`: `resolveBuilding` + `DEFAULT_MAPPING` + `validateMapping` — czyste, bez IO,
  testowalne w izolacji. `toolToBuilding` = wrapper (zgodność wsteczna).
- `server/mapping-config.ts` — całe IO pliku (load/save/atomic/cache). Reszta serwera zależy od
  interfejsu (`MappingConfig`), nie od ścieżki pliku.
- `client/mapping-store (useMapping)` — stan + sync (fetch/PUT/localStorage). UI zależy od store,
  nie od transportu.
- `client/hud/SettingsPanel` + `BuildingReactionsEditor` — czysta prezentacja/edycja; logika
  coverage i parsowania wyniesiona do testowalnych funkcji (`computeCoverage`, parser `,`/`;`).

## Obsługa błędów

- Brak/uszkodzony `tool-mapping.json` → `DEFAULT_MAPPING` (serwer się nie wywala).
- `PUT` z niepoprawnym configiem → 400 + `error`; klient pokazuje, ale **nie** psuje stanu gry.
- Niepoprawny JSON w textarea → walidacja blokuje zastosowanie (czerwona ramka), gra działa dalej.
- Nieznany `BuildingId` w regule → odrzucone przez `validateMapping`.
- Fetch `GET /tool-mapping` nieudany → zostaje cache z localStorage (lub `DEFAULT_MAPPING`).
- Niepoprawny regex w `pattern` → walidacja odrzuca regułę z czytelnym komunikatem.

## Testy (TDD)

- **shared:** `resolveBuilding` zgodne z `DEFAULT_MAPPING` dla wszystkich dzisiejszych
  przypadków (kopia asercji z `mapping.test.ts`) + custom config: przemapowanie `Edit→library`,
  edytowalny warunek git (zmieniony regex), prefiks, najdłuższy-prefiks wygrywa, fallback.
  `validateMapping`: poprawne/niepoprawne kształty, zły `BuildingId`, zły regex.
- **server:** `loadMappingConfig` (brak pliku→default, poprawny plik→config, śmieci→default);
  `building-stats` honoruje config (atrybucja z override); `GET`/`PUT /tool-mapping` (200/400);
  zapis invaliduje cache stats.
- **client:** `useMapping` (init z cache, GET nadpisuje, setMapping→localStorage+PUT, reset);
  parser wpisu `,`/`;` → reguły; `computeCoverage` (fallback/konflikt/socjalne wykluczone).
- **regresja:** istniejący `mapping.test.ts` (klient) przechodzi bez zmian.

## Poza zakresem (YAGNI / następne spece)

- Dodawanie **nowych** budynków przez usera (sprite + miejsce na mapie + i18n).
- Reorder reguł w UI (precedencja wg specyficzności wystarcza).
- Serwerowy endpoint `seenTools` ze skanu transkryptów (v1 = narzędzia z żywego stanu).
- Kolejne sekcje panelu ustawień (kalibracja sprite'ów, strojenie atrybucji) — panel je tylko
  przewiduje strukturalnie.
- Synchronizacja mapy między urządzeniami/chmurą (lokalny plik wystarcza).
