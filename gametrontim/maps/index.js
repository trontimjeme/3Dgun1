import * as courtyard from './courtyard-estate.js';
import * as urban from './urban-arena.js';
export { createSky, resolveCollision, createBoxBuilder } from './utils.js';

/** Danh sách map có sẵn */
export const MAP_REGISTRY = {
  [courtyard.MAP_ID]: {
    id: courtyard.MAP_ID,
    name: courtyard.MAP_NAME,
    description: courtyard.MAP_DESC,
    buildMap: courtyard.buildMap,
  },
  [urban.MAP_ID]: {
    id: urban.MAP_ID,
    name: urban.MAP_NAME,
    description: urban.MAP_DESC,
    buildMap: urban.buildMap,
  },
};

export const DEFAULT_MAP_ID = urban.MAP_ID;

/** Load map theo id — trả về mapData giống 3Dgun1 */
export function loadMap(scene, mapId = DEFAULT_MAP_ID) {
  const entry = MAP_REGISTRY[mapId];
  if (!entry) {
    throw new Error(`Unknown map: ${mapId}. Available: ${Object.keys(MAP_REGISTRY).join(', ')}`);
  }
  return entry.buildMap(scene);
}

export function listMaps() {
  return Object.values(MAP_REGISTRY).map(({ id, name, description }) => ({ id, name, description }));
}

// Re-export từng map để import trực tiếp nếu cần
export { courtyard, urban };
