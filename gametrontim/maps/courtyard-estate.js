import * as THREE from 'three';
import { createBoxBuilder } from './utils.js';

const WALL = 0xb8b8b8;
const ROOF = 0x2a2a2a;
const GRASS = 0x6b8f3a;
const PATH = 0xd4c4a8;
const HEDGE = 0x2d5a27;
const WATER = 0x1a3a5c;
const DOOR = 0xc0392b;
const WINDOW_GLOW = 0xffe08a;

export const MAP_ID = 'courtyard-estate';
export const MAP_NAME = 'Courtyard Estate';
export const MAP_DESC = 'Map gốc từ 3Dgun1 — sân trong, nhà chính, hàng rào, đài phun nước';

/**
 * Courtyard estate map (copy từ 3Dgun1/js/map.js):
 * perimeter wall, central path, octagon fountain, hedges, house, shed, pedestal.
 */
export function buildMap(scene) {
  const group = new THREE.Group();
  group.name = MAP_ID;
  const colliders = [];
  const addBox = createBoxBuilder(group, colliders);

  const ground = addBox(80, 0.4, 80, 0, -0.2, 0, GRASS, { collide: false });
  ground.receiveShadow = true;
  addBox(200, 0.2, 200, 0, -0.5, 0, 0x1a1a22, { collide: false });

  const wallH = 4.5;
  const wallT = 1.2;
  const halfW = 24;
  const halfD = 28;

  addBox(halfW * 2 + wallT, wallH, wallT, 0, wallH / 2, -halfD, WALL);
  const gateW = 5;
  const southLen = (halfW * 2 - gateW) / 2;
  addBox(southLen, wallH, wallT, -halfW + southLen / 2, wallH / 2, halfD, WALL);
  addBox(southLen, wallH, wallT, halfW - southLen / 2, wallH / 2, halfD, WALL);
  addBox(wallT, wallH, halfD * 2, -halfW, wallH / 2, 0, WALL);
  addBox(wallT, wallH, halfD * 2, halfW, wallH / 2, 0, WALL);
  addBox(1.2, wallH + 0.8, 1.4, -gateW / 2 - 0.3, (wallH + 0.8) / 2, halfD, WALL);
  addBox(1.2, wallH + 0.8, 1.4, gateW / 2 + 0.3, (wallH + 0.8) / 2, halfD, WALL);

  addBox(4.5, 0.08, 42, 0, 0.05, 4, PATH, { collide: false });
  const plaza = addBox(12, 0.1, 12, 0, 0.06, 2, PATH, { collide: false });
  plaza.rotation.y = Math.PI / 8;

  addBox(5.5, 0.6, 5.5, 0, 0.35, 2, 0xc8c0b0, { collide: true });
  const water = addBox(4.2, 0.3, 4.2, 0, 0.55, 2, WATER, { collide: false, roughness: 0.2, metalness: 0.3 });
  water.rotation.y = Math.PI / 8;
  addBox(1.2, 1.4, 1.2, 0, 1.1, 2, 0xd0c8b8);

  const hedge = (w, h, d, x, y, z) => addBox(w, h, d, x, y, z, HEDGE);
  hedge(6, 1.4, 1.2, -6, 0.7, 8);
  hedge(1.2, 1.4, 5, -8.4, 0.7, 5.5);
  hedge(6, 1.4, 1.2, 6, 0.7, 8);
  hedge(1.2, 1.4, 5, 8.4, 0.7, 5.5);
  hedge(6, 1.4, 1.2, -6, 0.7, -4);
  hedge(1.2, 1.4, 5, -8.4, 0.7, -1.5);
  hedge(6, 1.4, 1.2, 6, 0.7, -4);
  hedge(1.2, 1.4, 5, 8.4, 0.7, -1.5);
  hedge(1.4, 1.5, 14, -18, 0.75, 6);
  hedge(1.4, 1.5, 14, 18, 0.75, 6);
  hedge(1.4, 1.5, 10, -18, 0.75, -10);
  hedge(1.4, 1.5, 10, 18, 0.75, -10);

  const hx = 0, hz = -18;
  addBox(16, 5, 10, hx, 2.5, hz, 0xe8e4dc);
  addBox(17, 0.6, 11.5, hx, 5.4, hz, ROOF);
  const roofL = addBox(17.2, 0.5, 7, hx, 6.5, hz - 1.5, ROOF, { collide: false });
  roofL.rotation.x = 0.35;
  const roofR = addBox(17.2, 0.5, 7, hx, 6.5, hz + 1.5, ROOF, { collide: false });
  roofR.rotation.x = -0.35;
  addBox(1.4, 2.5, 1.4, hx + 4, 7.2, hz - 2, ROOF);
  addBox(8, 0.3, 3, hx, 0.2, hz + 6.2, 0xd8d0c4);
  addBox(0.5, 3.2, 0.5, hx - 3, 1.8, hz + 7.2, 0xe8e4dc);
  addBox(0.5, 3.2, 0.5, hx + 3, 1.8, hz + 7.2, 0xe8e4dc);
  addBox(8, 0.35, 0.5, hx, 3.4, hz + 7.2, 0xe8e4dc);
  addBox(1.8, 2.8, 0.2, hx, 1.5, hz + 5.1, DOOR, { collide: false });
  addBox(1.6, 1.4, 0.15, hx - 4.5, 2.2, hz + 5.05, WINDOW_GLOW, { collide: false, emissive: WINDOW_GLOW, emissiveIntensity: 0.4 });
  addBox(1.6, 1.4, 0.15, hx + 4.5, 2.2, hz + 5.05, WINDOW_GLOW, { collide: false, emissive: WINDOW_GLOW, emissiveIntensity: 0.4 });
  addBox(1.6, 1.2, 0.15, hx - 4.5, 4.2, hz + 5.05, WINDOW_GLOW, { collide: false, emissive: WINDOW_GLOW, emissiveIntensity: 0.35 });
  addBox(1.6, 1.2, 0.15, hx + 4.5, 4.2, hz + 5.05, WINDOW_GLOW, { collide: false, emissive: WINDOW_GLOW, emissiveIntensity: 0.35 });

  addBox(6, 3.2, 5, -12, 1.6, 14, 0xe0dcd4);
  addBox(6.5, 0.5, 5.5, -12, 3.4, 14, ROOF);
  addBox(1.4, 2.2, 0.15, -12, 1.2, 16.55, 0x8b6914, { collide: false });

  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.7 })
  );
  ped.position.set(10, 0.8, 14);
  group.add(ped);
  colliders.push({
    min: new THREE.Vector3(8.8, 0, 12.8),
    max: new THREE.Vector3(11.2, 1.6, 15.2),
    mesh: ped,
  });

  addBox(0.4, 0.3, 0.6, -10, 3.5, halfD - 0.8, 0x111111, { collide: false });
  addBox(2, 1.5, 2, -14, 0.75, -8, 0x8b7355);
  addBox(2, 1.5, 2, 14, 0.75, -8, 0x8b7355);
  addBox(2.5, 1.2, 1.5, -10, 0.6, 20, 0x6b5b45);
  addBox(2.5, 1.2, 1.5, 10, 0.6, 20, 0x6b5b45);

  scene.add(group);

  const bounds = {
    minX: -halfW + 1.5,
    maxX: halfW - 1.5,
    minZ: -halfD + 1.5,
    maxZ: halfD - 1.5,
  };

  const spawns = {
    CT: [
      { x: -4, z: 24 },
      { x: 0, z: 24 },
      { x: 4, z: 24 },
      { x: -6, z: 22 },
      { x: 6, z: 22 },
    ],
    T: [
      { x: -4, z: -24 },
      { x: 0, z: -22 },
      { x: 4, z: -24 },
      { x: -8, z: -20 },
      { x: 8, z: -20 },
    ],
  };

  const crateSpots = [
    { x: 0, z: 10 },
    { x: -10, z: 2 },
    { x: 10, z: 2 },
    { x: -6, z: -10 },
    { x: 6, z: -10 },
    { x: 0, z: -6 },
    { x: -14, z: 10 },
    { x: 14, z: 10 },
    { x: -4, z: 18 },
    { x: 4, z: 18 },
  ];

  return { id: MAP_ID, name: MAP_NAME, group, colliders, bounds, spawns, crateSpots };
}
