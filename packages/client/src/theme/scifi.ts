import { isometric } from '../game/projection';
import type { ThemeDef } from './types';

/**
 * Motyw sci-fi (izometryczny, docelowo assety acdrnx CC0).
 * Ten sam układ logiczny co fantasy — zmienia się tylko projekcja,
 * nazwy budynków i paleta (marsjańska baza).
 */
export const SCIFI: ThemeDef = {
  id: 'scifi',
  name: 'Stacja (sci-fi)',
  style: 'iso',
  projection: isometric(64, 32),
  tile: 64,
  grid: { w: 40, h: 26 },
  buildings: [
    { id: 'citadel', label: 'Centrum dowodzenia', gx: 16.5, gy: 9, w: 4, h: 3, door: { gx: 19.5, gy: 14.5 }, placeholderColor: 0x8c93a8 },
    { id: 'tower', label: 'Laboratorium', gx: 4.5, gy: 2, w: 2, h: 3, door: { gx: 6, gy: 7.5 }, placeholderColor: 0x7f77dd },
    { id: 'forge', label: 'Fabryka dronów', gx: 31, gy: 3, w: 3, h: 2, door: { gx: 33, gy: 7 }, placeholderColor: 0xd85a30 },
    { id: 'library', label: 'Archiwum danych', gx: 2, gy: 14, w: 3, h: 2, door: { gx: 4.5, gy: 17.5 }, placeholderColor: 0x378add },
    { id: 'mine', label: 'Rafineria', gx: 32, gy: 14.5, w: 3, h: 2, door: { gx: 34, gy: 18 }, placeholderColor: 0x5f5e5a },
    { id: 'barracks', label: 'Hangar', gx: 9, gy: 20, w: 3, h: 2, door: { gx: 11, gy: 19.5 }, placeholderColor: 0x1d9e75 },
    { id: 'market', label: 'Port kosmiczny', gx: 26, gy: 20, w: 3, h: 2, door: { gx: 28, gy: 19.5 }, placeholderColor: 0xba7517 },
    { id: 'guild', label: 'Stacja łączności', gx: 17, gy: 20.5, w: 3, h: 2, door: { gx: 19.5, gy: 20 }, placeholderColor: 0xd4537e },
  ],
  crossroads: [
    { id: 'x-center', gx: 19.5, gy: 16.5 },
    { id: 'x-west', gx: 10.5, gy: 12 },
    { id: 'x-east', gx: 29, gy: 12 },
    { id: 'x-nw', gx: 9, gy: 7.5 },
    { id: 'x-ne', gx: 29, gy: 7.5 },
  ],
  edges: [
    ['door:citadel', 'x-center'],
    ['x-center', 'door:barracks'],
    ['x-center', 'door:market'],
    ['x-center', 'door:guild'],
    ['x-center', 'x-west'],
    ['x-center', 'x-east'],
    ['x-west', 'door:library'],
    ['x-west', 'x-nw'],
    ['x-nw', 'door:tower'],
    ['x-east', 'door:mine'],
    ['x-east', 'x-ne'],
    ['x-ne', 'door:forge'],
  ],
  terrain: { base: 0x8a4b32, alt: 0x93553a, path: 0x5a5e66 },
};
