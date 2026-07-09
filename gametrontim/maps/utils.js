import * as THREE from 'three';

/** Sky, lighting, clouds — dùng chung cho mọi map */
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
    const minX = c.min.x - radius;
    const maxX = c.max.x + radius;
    const minZ = c.min.z - radius;
    const maxZ = c.max.z + radius;
    const minY = c.min.y;
    const maxY = c.max.y;

    if (px > minX && px < maxX && pz > minZ && pz < maxZ && py < maxY && py + height > minY) {
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

/** Helper tạo box + collider cho map builders */
export function createBoxBuilder(group, colliders) {
  return (w, h, d, x, y, z, color, opts = {}) => {
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
}
