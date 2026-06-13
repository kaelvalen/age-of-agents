# Plan B — Środowisko sci-fi (izometria) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Bogate środowisko izometryczne dla motywu sci-fi: teren z kafli-diamentów (per-cel, bez Wang) + generowane budynki/dekoracje izo, mapa 40×26 — reużywając maksimum kodu z fantasy.

**Architecture:** Reuse: `buildTerrainMap` (biomy logiczne grass/dirt/water/rock), `decorations.ts` (scatter/decoRule), loadery, `pack-objects.mjs`, `buildBuilding`→`buildBuildingSprite`/`buildIsoBlock`, projekcja izo. Nowe: `tilemap-iso.ts` (Sprite-per-cel diament, anchor centralny, tint jitter) + gałąź izo w `view.ts` + rozszerzenie scatter na izo. Generacja przez `create_isometric_tile` (jedyna ścieżka izo).

**Spec:** [docs/superpowers/specs/2026-06-13-rich-environment-design.md](../specs/2026-06-13-rich-environment-design.md) (Plan B). Brief feasibility: workflow `scifi-iso-env-feasibility`.

## Decyzje z researchu

- **Teren:** `create_isometric_tile` `size=32 tile_shape="thin tile" outline="lineless" shading="basic" detail="medium"` + wspólny `seed`. Output = przezroczysty diament. 4 terenów: regolith(grass)/plating(dirt)/energy(water)/crater(rock) — nazwane po **logicznym TerrainId** w assetach, by `buildTerrainMap` mapował 1:1.
- **Budynki:** `create_isometric_tile` `size=64 tile_shape="block" detail="highly detailed" shading="medium" outline="selective"` + ten sam `seed`. 8 ID sci-fi. Cap 64px → duże budynki mogą spaść na `buildIsoBlock` (router robi to sam).
- **Dekoracje:** `create_isometric_tile` `size=32 tile_shape="thick tile"/"block"` + seed. 4 (skrzynie/antena/skały/baliza).
- **Render:** Sprite-per-cel, anchor (0.5,0.5), pos `toScreen(gx,gy)`; warstwa tła niesortowana pod `unitLayer`. Polish: tint jitter ±5%. Bez przejść.
- **Kotwica obiektów izo:** `toScreen` zwraca ŚRODEK diamentu; obiekty stopą na ziemi → strojenie offsetu `+tileH/2` w walidacji (Task 6).

## Tasks

### Task 1: Relayout scifi → 40×26 (reuse współrzędnych fantasy)
- Modify `packages/client/src/theme/scifi.ts:15-32` — grid 40×26 + pozycje budynków/skrzyżowań jak w fantasy (te same gx/gy/door, zachowane labele sci-fi + placeholderColor + terrain palette).
- Build + commit.

### Task 2: Generacja iso (probe + reszta), wspólny seed
- `get_balance`. Probe: 1 teren (`create_isometric_tile` regolith) → `get_isometric_tile` → obejrzyj format (diament, przezroczystość, rozmiar) → ustal `seed`.
- Wygeneruj resztę: 3 terenów + 8 budynków + 4 dekoracje, wszystkie z tym `seed`. Poll `get_isometric_tile`. Pobierz PNG.

### Task 3: Pakowanie
- Teren: pack BEZ trim/bg-removal (zachować pełny diament) → `/assets/scifi/tilemap/<terrainId>.{png,json}` + `index.json {terrains:[...], tile:64, tileH:32}`. (Dodać tryb `raw` do pack-objects lub mały pack.)
- Budynki/dekoracje: `pack-objects.mjs scifi buildings` / `... decorations` (trim+bg-removal nieszkodliwe — iso-tile już przezroczyste).

### Task 4: `tilemap-iso.ts` (nowy)
- `buildIsoTilemap(theme): Container` — `buildTerrainMap(theme)` → per-cel `Sprite(terrainTex[id])`, anchor (0.5,0.5), pos `toScreen(gx,gy)`, tint jitter. Loader iso-terenu (Assets.load per terrainId z index.json).

### Task 5: Wpięcie w `view.ts`
- Gałąź izo terenu: `else if (style==='iso' && hasIsoTiles()) worldLayer.addChild(buildIsoTilemap(theme))`.
- Rozszerz scatter dekoracji na `iso` (zdejmij/rozszerz bramkę `topdown`).
- Ładowanie iso-terenu w `Promise.all`.

### Task 6: Walidacja + strojenie
- Offline kompozyt izo (`preview-scene-iso.ts`) + browser (console). Stroj kotwicę obiektów izo (offset `+tileH/2`) i skalę.

### Task 7: Inwariant + commit
- Grep zero-runtime; build+testy; commit (assety za zgodą — już autoryzowane).

## Reuse (bez zmian): terrain-map.ts, decorations.ts, building-sprites.ts, decoration-sprites.ts, pack-objects.mjs, projection.ts, placeholders.ts, unit.ts, autotile.ts.
