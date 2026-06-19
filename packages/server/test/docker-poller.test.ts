import { describe, expect, it } from 'vitest';
import { World } from '../src/world.js';
import { SessionTracker } from '../src/state-machine.js';

describe('SessionTracker — extra (container)', () => {
  it('domieszuje pole container do bohatera i zachowuje je przy kolejnych patchach', () => {
    const world = new World();
    const container = { id: 'abc123', name: 'devbox', image: 'node:20' };
    const tracker = new SessionTracker(world, 'docker:abc123:s1', 'docker://devbox', undefined, 'claude', { container });

    tracker.apply({ kind: 'prompt', text: 'Dodaj endpoint /health', ts: '2026-06-20T10:00:00.000Z' });
    expect(world.getHero('docker:abc123:s1')?.container).toEqual(container);

    // Kolejny patch (np. zmiana stanu) nie gubi container.
    tracker.apply({ kind: 'meta', cwd: '/workspace/app', ts: '2026-06-20T10:00:01.000Z' });
    expect(world.getHero('docker:abc123:s1')?.container).toEqual(container);
    expect(world.getHero('docker:abc123:s1')?.workingDir).toBe('/workspace/app');
  });
});
