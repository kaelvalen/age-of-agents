import { describe, expect, it } from 'vitest';
import { parseDockerPs } from '../src/sources/docker-client.js';

describe('parseDockerPs', () => {
  it('parsuje linie JSON na ContainerInfo (ID/Names/Image)', () => {
    const stdout =
      '{"ID":"abc123","Names":"devbox","Image":"node:20"}\n' +
      '{"ID":"def456","Names":"web,web-alias","Image":"caddy:2"}\n';
    expect(parseDockerPs(stdout)).toEqual([
      { id: 'abc123', name: 'devbox', image: 'node:20' },
      { id: 'def456', name: 'web', image: 'caddy:2' }, // pierwsza nazwa z listy
    ]);
  });

  it('pomija puste i nie-JSON linie', () => {
    const stdout = '\n  \nto nie json{\n{"ID":"x","Names":"y","Image":"z"}\n';
    expect(parseDockerPs(stdout)).toEqual([{ id: 'x', name: 'y', image: 'z' }]);
  });

  it('pomija rekordy bez ID', () => {
    expect(parseDockerPs('{"Names":"brak-id","Image":"i"}\n')).toEqual([]);
  });
});
