import { Assets, type Spritesheet } from 'pixi.js';
import type { BuildingId } from '../theme/types';

const sheets = new Map<string, Spritesheet>();

/** Ładuje sprite'y budynków danego motywu wg index.json. Brak → fallback placeholdera. */
export async function loadBuildingSprites(themeId: string): Promise<void> {
  sheets.clear();
  try {
    const res = await fetch(`/assets/${themeId}/buildings/index.json`);
    if (!res.ok) return;
    const idx: { ids: string[] } = await res.json();
    for (const id of idx.ids) {
      try {
        sheets.set(id, await Assets.load<Spritesheet>(`/assets/${themeId}/buildings/${id}.json`));
      } catch {
        /* pojedynczy brak → fallback dla tego budynku */
      }
    }
  } catch {
    /* brak indeksu → wszystkie budynki na placeholderach */
  }
}

export function getBuildingSprite(id: BuildingId): Spritesheet | null {
  return sheets.get(id) ?? null;
}
