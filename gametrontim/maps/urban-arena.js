import * as THREE from 'three';
import { createBoxBuilder } from './utils.js';

const CONCRETE = 0x8a8a8a;
const ASPHALT = 0x3a3a42;
const METAL = 0x5a6a7a;
const CONTAINER_RED = 0xb33a2a;
const CONTAINER_BLUE = 0x2a4a8a;
const CRATE = 0x8b7355;
const RAMP = 0x6a6a72;

export const MAP_ID = 'urban-arena';
export const MAP_NAME = 'Urban Arena';
export const MAP_DESC = 'Map mới — kho công nghiệp, container, ramp, 3 lane chiến thuật';

/**
 * Map mới cho gametrontim: arena công nghiệp đối xứng,
 * 3 làn (trái / giữa / phải), container cover, ramp mid.
 */
export function buildMap(scene) {
  const group = new THREE.Group();
  group.name = MAP_ID;
  const colliders = [];
  const addBox = createBoxBuilder(group, colliders);

  const halfW = 20;
  const halfD = 22;
  const wallH = 5;
  const wallT = 1.5;

  // Nền bê tông + viền tối
  addBox(90, 0.5, 90, 0, -0.25, 0, ASPHALT, { collide: false });
  addBox(180, 0.2, 180, 0, -0.55, 0, 0x14141a, { collide: false });

  // Tường bao
  addBox(halfW * 2 + wallT, wallH, wallT, 0, wallH / 2, -halfD, CONCRETE);
  addBox(halfW * 2 + wallT, wallH, wallT, 0, wallH / 2, halfD, CONCRETE);
  addBox(wallT, wallH, halfD * 2, -halfW, wallH / 2, 0, CONCRETE);
  addBox(wallT, wallH, halfD * 2, halfW, wallH / 2, 0, CONCRETE);

  // Vạch kẻ đường giữa
  for (let z = -18; z <= 18; z += 4) {
    addBox(0.35, 0.06, 1.8, 0, 0.04, z, 0xf0f0f0, { collide: false });
  }

  // Mid platform + ramp (điểm tranh chấp)
  addBox(8, 0.4, 8, 0, 0.2, 0, CONCRETE);
  addBox(6, 0.35, 2.5, 0, 0.55, -5.5, RAMP, { collide: false });
  const ramp = addBox(6, 0.35, 2.5, 0, 0.55, 5.5, RAMP, { collide: false });
  ramp.rotation.x = -0.22;
  addBox(3, 1.2, 3, 0, 1.0, 0, METAL);

  // Container cover — lane trái
  addBox(3.5, 2.8, 7, -12, 1.4, -8, CONTAINER_RED);
  addBox(3.5, 2.8, 7, -12, 1.4, 8, CONTAINER_BLUE);
  addBox(2, 1.6, 2, -14, 0.8, 0, CRATE);
  addBox(2, 1.6, 2, -8, 0.8, -14, CRATE);
  addBox(2, 1.6, 2, -8, 0.8, 14, CRATE);

  // Container cover — lane phải
  addBox(3.5, 2.8, 7, 12, 1.4, -8, CONTAINER_BLUE);
  addBox(3.5, 2.8, 7, 12, 1.4, 8, CONTAINER_RED);
  addBox(2, 1.6, 2, 14, 0.8, 0, CRATE);
  addBox(2, 1.6, 2, 8, 0.8, -14, CRATE);
  addBox(2, 1.6, 2, 8, 0.8, 14, CRATE);

  // Tường ngang chia map (có lỗ ở giữa)
  addBox(8, 3, 1.2, -10, 1.5, 0, CONCRETE);
  addBox(8, 3, 1.2, 10, 1.5, 0, CONCRETE);

  // Cột thép góc
  for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 6, 8),
      new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.4, roughness: 0.5 })
    );
    col.position.set(x, 3, z);
    group.add(col);
    colliders.push({
      min: new THREE.Vector3(x - 0.6, 0, z - 0.6),
      max: new THREE.Vector3(x + 0.6, 6, z + 0.6),
      mesh: col,
    });
  }

  // Đèn hiện trường
  for (const x of [-10, 0, 10]) {
    addBox(0.3, 0.3, 0.3, x, 4.8, -18, 0xffeeaa, {
      collide: false,
      emissive: 0xffeeaa,
      emissiveIntensity: 0.6,
    });
    addBox(0.15, 3, 0.15, x, 2.5, -18, METAL, { collide: false });
  }

  scene.add(group);

  const bounds = {
    minX: -halfW + 1.5,
    maxX: halfW - 1.5,
    minZ: -halfD + 1.5,
    maxZ: halfD - 1.5,
  };

  const spawns = {
    CT: [
      { x: -6, z: 18 },
      { x: 0, z: 19 },
      { x: 6, z: 18 },
      { x: -12, z: 16 },
      { x: 12, z: 16 },
    ],
    T: [
      { x: -6, z: -18 },
      { x: 0, z: -19 },
      { x: 6, z: -18 },
      { x: -12, z: -16 },
      { x: 12, z: -16 },
    ],
  };

  const crateSpots = [
    { x: 0, z: 6 },
    { x: -12, z: 0 },
    { x: 12, z: 0 },
    { x: -6, z: -10 },
    { x: 6, z: -10 },
    { x: 0, z: -6 },
    { x: -14, z: 12 },
    { x: 14, z: 12 },
    { x: -4, z: 14 },
    { x: 4, z: 14 },
  ];

  return { id: MAP_ID, name: MAP_NAME, group, colliders, bounds, spawns, crateSpots };
}
