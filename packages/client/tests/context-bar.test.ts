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
