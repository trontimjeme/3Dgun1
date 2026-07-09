import * as THREE from 'three';

const WALL = 0xb8b8b8;
const ROOF = 0x2a2a2a;
const GRASS = 0x6b8f3a;
const PATH = 0xd4c4a8;
const HEDGE = 0x2d5a27;
const WATER = 0x1a3a5c;
const DOOR = 0xc0392b;
const WINDOW_GLOW = 0xffe08a;

/**
 * Courtyard estate map matching the reference:
 * perimeter wall, central path, octagon fountain, hedges, house, shed, pedestal.
 */
export function buildMap(scene) {
  const group = new THREE.Group();
  group.name = 'map';
  const colliders = [];

  const addBox = (w, h, d, x, y, z, color, opts = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0.05,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    // Shadows optional — many mobile/Vercel preview GPUs struggle with shadow maps
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (opts.collide !== false) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
        mesh,
      });
    }
    return mesh;
  };

  // Ground
  const ground = addBox(80, 0.4, 80, 0, -0.2, 0, GRASS, { collide: false });
  ground.receiveShadow = true;

  // Outer dark void floor (outside walls)
  addBox(200, 0.2, 200, 0, -0.5, 0, 0x1a1a22, { collide: false });

  // Perimeter walls — courtyard ~48 x 56
  const wallH = 4.5;
  const wallT = 1.2;
  const halfW = 24;
  const halfD = 28;

  // North wall (behind house)
  addBox(halfW * 2 + wallT, wallH, wallT, 0, wallH / 2, -halfD, WALL);
  // South wall with gate gap
  const gateW = 5;
  const southLen = (halfW * 2 - gateW) / 2;
  addBox(southLen, wallH, wallT, -halfW + southLen / 2, wallH / 2, halfD, WALL);
  addBox(southLen, wallH, wallT, halfW - southLen / 2, wallH / 2, halfD, WALL);
  // East / West
  addBox(wallT, wallH, halfD * 2, -halfW, wallH / 2, 0, WALL);
  addBox(wallT, wallH, halfD * 2, halfW, wallH / 2, 0, WALL);

  // Gate pillars
  addBox(1.2, wallH + 0.8, 1.4, -gateW / 2 - 0.3, (wallH + 0.8) / 2, halfD, WALL);
  addBox(1.2, wallH + 0.8, 1.4, gateW / 2 + 0.3, (wallH + 0.8) / 2, halfD, WALL);

  // Central path
  addBox(4.5, 0.08, 42, 0, 0.05, 4, PATH, { collide: false });

  // Octagon plaza around fountain
  const plaza = addBox(12, 0.1, 12, 0, 0.06, 2, PATH, { collide: false });
  plaza.rotation.y = Math.PI / 8;

  // Fountain
  addBox(5.5, 0.6, 5.5, 0, 0.35, 2, 0xc8c0b0, { collide: true });
  const water = addBox(4.2, 0.3, 4.2, 0, 0.55, 2, WATER, {
    collide: false,
    roughness: 0.2,
    metalness: 0.3,
  });
  water.rotation.y = Math.PI / 8;
  // Fountain center pillar
  addBox(1.2, 1.4, 1.2, 0, 1.1, 2, 0xd0c8b8);

  // Hedges — L shapes around fountain + side runs
  const hedge = (w, h, d, x, y, z) => addBox(w, h, d, x, y, z, HEDGE);

  // L near fountain SW
  hedge(6, 1.4, 1.2, -6, 0.7, 8);
  hedge(1.2, 1.4, 5, -8.4, 0.7, 5.5);
  // L SE
  hedge(6, 1.4, 1.2, 6, 0.7, 8);
  hedge(1.2, 1.4, 5, 8.4, 0.7, 5.5);
  // L NW
  hedge(6, 1.4, 1.2, -6, 0.7, -4);
  hedge(1.2, 1.4, 5, -8.4, 0.7, -1.5);
  // L NE
  hedge(6, 1.4, 1.2, 6, 0.7, -4);
  hedge(1.2, 1.4, 5, 8.4, 0.7, -1.5);

  // Side hedge runs
  hedge(1.4, 1.5, 14, -18, 0.75, 6);
  hedge(1.4, 1.5, 14, 18, 0.75, 6);
  hedge(1.4, 1.5, 10, -18, 0.75, -10);
  hedge(1.4, 1.5, 10, 18, 0.75, -10);

  // Main house (north)
  const hx = 0, hz = -18;
  addBox(16, 5, 10, hx, 2.5, hz, 0xe8e4dc); // body
  // Roof (gabled approx with boxes)
  addBox(17, 0.6, 11.5, hx, 5.4, hz, ROOF);
  // Roof peak
  const roofL = addBox(17.2, 0.5, 7, hx, 6.5, hz - 1.5, ROOF, { collide: false });
  roofL.rotation.x = 0.35;
  const roofR = addBox(17.2, 0.5, 7, hx, 6.5, hz + 1.5, ROOF, { collide: false });
  roofR.rotation.x = -0.35;
  // Chimney
  addBox(1.4, 2.5, 1.4, hx + 4, 7.2, hz - 2, ROOF);
  // Porch
  addBox(8, 0.3, 3, hx, 0.2, hz + 6.2, 0xd8d0c4);
  addBox(0.5, 3.2, 0.5, hx - 3, 1.8, hz + 7.2, 0xe8e4dc);
  addBox(0.5, 3.2, 0.5, hx + 3, 1.8, hz + 7.2, 0xe8e4dc);
  addBox(8, 0.35, 0.5, hx, 3.4, hz + 7.2, 0xe8e4dc);
  // Door
  addBox(1.8, 2.8, 0.2, hx, 1.5, hz + 5.1, DOOR, { collide: false });
  // Windows with glow
  addBox(1.6, 1.4, 0.15, hx - 4.5, 2.2, hz + 5.05, WINDOW_GLOW, {
    collide: false,
    emissive: WINDOW_GLOW,
    emissiveIntensity: 0.4,
  });
  addBox(1.6, 1.4, 0.15, hx + 4.5, 2.2, hz + 5.05, WINDOW_GLOW, {
    collide: false,
    emissive: WINDOW_GLOW,
    emissiveIntensity: 0.4,
  });
  addBox(1.6, 1.2, 0.15, hx - 4.5, 4.2, hz + 5.05, WINDOW_GLOW, {
    collide: false,
    emissive: WINDOW_GLOW,
    emissiveIntensity: 0.35,
  });
  addBox(1.6, 1.2, 0.15, hx + 4.5, 4.2, hz + 5.05, WINDOW_GLOW, {
    collide: false,
    emissive: WINDOW_GLOW,
    emissiveIntensity: 0.35,
  });

  // Small shed (left of path)
  addBox(6, 3.2, 5, -12, 1.6, 14, 0xe0dcd4);
  addBox(6.5, 0.5, 5.5, -12, 3.4, 14, ROOF);
  addBox(1.4, 2.2, 0.15, -12, 1.2, 16.55, 0x8b6914, { collide: false });

  // Pedestal / well (right of path)
  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.7 })
  );
  ped.position.set(10, 0.8, 14);
  ped.castShadow = true;
  group.add(ped);
  colliders.push({
    min: new THREE.Vector3(8.8, 0, 12.8),
    max: new THREE.Vector3(11.2, 1.6, 15.2),
    mesh: ped,
  });

  // Security camera on south wall
  addBox(0.4, 0.3, 0.6, -10, 3.5, halfD - 0.8, 0x111111, { collide: false });

  // Cover crates (static props, not weapon crates)
  addBox(2, 1.5, 2, -14, 0.75, -8, 0x8b7355);
  addBox(2, 1.5, 2, 14, 0.75, -8, 0x8b7355);
  addBox(2.5, 1.2, 1.5, -10, 0.6, 20, 0x6b5b45);
  addBox(2.5, 1.2, 1.5, 10, 0.6, 20, 0x6b5b45);

  scene.add(group);

  // Bounds for spawn / movement
  const bounds = {
    minX: -halfW + 1.5,
    maxX: halfW - 1.5,
    minZ: -halfD + 1.5,
    maxZ: halfD - 1.5,
  };

  // Spawn points
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

  // Weapon crate spawn positions
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

  return { group, colliders, bounds, spawns, crateSpots };
}

export function createSky(scene) {
  scene.background = new THREE.Color(0x5ec8ff);
  scene.fog = new THREE.Fog(0x87ceeb, 60, 140);

  const hemi = new THREE.HemisphereLight(0xb1e1ff, 0x6b8f3a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.35);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  // Soft clouds as flat discs
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    roughness: 1,
  });
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 3, 8, 6), cloudMat);
    c.scale.y = 0.35;
    c.position.set((Math.random() - 0.5) * 100, 28 + Math.random() * 10, (Math.random() - 0.5) * 100);
    scene.add(c);
  }

  return { sun, hemi };
}

/** AABB player collision against map colliders */
export function resolveCollision(pos, radius, height, colliders) {
  const px = pos.x;
  const pz = pos.z;
  const py = pos.y;
  for (const c of colliders) {
    // Expand AABB by player radius
    const minX = c.min.x - radius;
    const maxX = c.max.x + radius;
    const minZ = c.min.z - radius;
    const maxZ = c.max.z + radius;
    const minY = c.min.y;
    const maxY = c.max.y;

    if (px > minX && px < maxX && pz > minZ && pz < maxZ && py < maxY && py + height > minY) {
      // Push out on smallest axis
      const dxL = px - minX;
      const dxR = maxX - px;
      const dzL = pz - minZ;
      const dzR = maxZ - pz;
      const minD = Math.min(dxL, dxR, dzL, dzR);
      if (minD === dxL) pos.x = minX;
      else if (minD === dxR) pos.x = maxX;
      else if (minD === dzL) pos.z = minZ;
      else pos.z = maxZ;
    }
  }
  return pos;
}
