import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModelConfig, saveModelConfig, invalidateModelConfigCache } from '../src/model-config.js';
import { DEFAULT_MODEL_CONFIG, type ModelConfig } from '@agent-citadel/shared';

function tmpPath(name = 'model-config.json'): string {
  return join(mkdtempSync(join(tmpdir(), 'aoa-model-')), name);
}

beforeEach(() => invalidateModelConfigCache());

const CUSTOM: ModelConfig = {
  sprites: [{ match: { kind: 'pattern', pattern: 'opus' }, sprite: 'opus' }],
  windows: [{ match: { kind: 'pattern', pattern: 'opus' }, contextWindow: 500_000 }],
  fallback: { sprite: 'sonnet', contextWindow: 200_000 },
};

describe('loadModelConfig', () => {
  it('brak pliku → DEFAULT', async () => {
    expect(await loadModelConfig(tmpPath())).toEqual(DEFAULT_MODEL_CONFIG);
  });
  it('poprawny plik → wczytany config', async () => {
    const p = tmpPath();
    writeFileSync(p, JSON.stringify(CUSTOM));
    expect(await loadModelConfig(p)).toEqual(CUSTOM);
  });
  it('uszkodzony JSON → DEFAULT', async () => {
    const p = tmpPath();
    writeFileSync(p, '{ nie json');
    expect(await loadModelConfig(p)).toEqual(DEFAULT_MODEL_CONFIG);
  });
  it('niepoprawny config (zły sprite) → DEFAULT', async () => {
    const p = tmpPath();
    writeFileSync(p, JSON.stringify({ sprites: [{ match: { kind: 'pattern', pattern: 'x' }, sprite: 'nope' }], windows: [], fallback: { sprite: 'sonnet', contextWindow: 1 } }));
    expect(await loadModelConfig(p)).toEqual(DEFAULT_MODEL_CONFIG);
  });
});

describe('saveModelConfig', () => {
  it('tworzy katalog, zapisuje, load oddaje nowy config', async () => {
    const p = join(mkdtempSync(join(tmpdir(), 'aoa-model-')), 'nested', 'model-config.json');
    const saved = await saveModelConfig(CUSTOM, p);
    expect(saved).toEqual(CUSTOM);
    expect(existsSync(p)).toBe(true);
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual(CUSTOM);
    expect(await loadModelConfig(p)).toEqual(CUSTOM);
  });
  it('odrzuca niepoprawny config', async () => {
    await expect(saveModelConfig({ sprites: [], windows: [], fallback: { sprite: 'nope', contextWindow: 1 } } as unknown as ModelConfig, tmpPath())).rejects.toThrow();
  });
});
