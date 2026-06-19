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
