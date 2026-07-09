import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const SKIN = 0xc4a574;
const BOOT = 0x1a1a1a;

const TEAM_COLORS = {
  CT: { vest: 0x1e3a5f, pants: 0x1a2f4a, helmet: 0x1e3a5f, label: 'CS:GO' },
  T: { vest: 0x4a5c2a, pants: 0x3d4a28, helmet: 0x5a6b3a, label: 'MP31' },
};

function box(w, h, d, color, y = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
  m.position.y = y;
  m.castShadow = true;
  return m;
}

/** Blocky LEGO/Roblox-style tactical operative */
export function createCharacter(team = 'CT', variant = 0) {
  const colors = TEAM_COLORS[team] || TEAM_COLORS.CT;
  const root = new THREE.Group();
  root.name = 'character';

  // Legs
  const legL = box(0.35, 0.7, 0.35, colors.pants, 0.35);
  legL.position.x = -0.22;
  const legR = box(0.35, 0.7, 0.35, colors.pants, 0.35);
  legR.position.x = 0.22;
  // Boots
  const bootL = box(0.38, 0.22, 0.45, BOOT, 0.11);
  bootL.position.x = -0.22;
  const bootR = box(0.38, 0.22, 0.45, BOOT, 0.11);
  bootR.position.x = 0.22;

  // Torso / vest
  const torso = box(0.85, 0.95, 0.45, SKIN, 1.15);
  const vest = box(0.9, 0.7, 0.5, colors.vest, 1.2);
  // Pouches
  const pouch1 = box(0.2, 0.22, 0.12, 0x222222, 1.15);
  pouch1.position.z = 0.28;
  pouch1.position.x = -0.2;
  const pouch2 = box(0.2, 0.22, 0.12, 0x222222, 1.15);
  pouch2.position.z = 0.28;
  pouch2.position.x = 0.2;

  // Vest label
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(colors.label, 64, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.12),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  label.position.set(0, 1.35, 0.26);

  // Head
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 })
  );
  head.position.y = 1.9;
  head.castShadow = true;

  // Face
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat);
  eyeL.position.set(-0.12, 1.95, 0.26);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), eyeMat);
  mouth.position.set(0, 1.78, 0.26);

  // Helmet
  const helmet = box(0.55, 0.28, 0.55, colors.helmet, 2.12);
  const goggles = box(0.4, 0.1, 0.15, 0x222222, 2.05);
  goggles.position.z = 0.22;

  // Arms
  const armL = box(0.28, 0.75, 0.28, variant % 2 === 0 ? SKIN : colors.pants, 1.15);
  armL.position.set(-0.58, 0, 0);
  const armR = box(0.28, 0.75, 0.28, SKIN, 1.15);
  armR.position.set(0.58, 0, 0);
  // Hands (C-shaped look via boxes)
  const handL = box(0.22, 0.22, 0.22, 0x111111, 0.7);
  handL.position.x = -0.58;
  const handR = box(0.22, 0.22, 0.22, 0x111111, 0.7);
  handR.position.x = 0.58;

  const body = new THREE.Group();
  body.add(legL, legR, bootL, bootR, torso, vest, pouch1, pouch2, label);
  body.add(head, eyeL, eyeR, mouth, helmet, goggles, armL, armR, handL, handR);
  root.add(body);

  // Weapon mount
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.35, 1.1, 0.35);
  root.add(weaponMount);

  root.userData = {
    team,
    body,
    armL,
    armR,
    legL,
    legR,
    weaponMount,
    animPhase: Math.random() * Math.PI * 2,
  };

  return root;
}

export function createWeaponMesh(weaponId) {
  const def = WEAPONS[weaponId];
  if (!def) return new THREE.Group();

  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(def.longBarrel ? 1.4 : 0.9, 0.18, 0.22),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, metalness: 0.3 })
  );
  body.position.set(0.2, 0, 0);
  g.add(body);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.2, 0.12),
    new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.7 })
  );
  stock.position.set(-0.35, -0.05, 0);
  g.add(stock);

  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.35, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  mag.position.set(0.05, -0.22, 0);
  g.add(mag);

  if (def.type === 'sniper') {
    const scope = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.15, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    scope.position.set(0.1, 0.18, 0);
    g.add(scope);
  }

  if (def.id === 'USP' || def.id === 'GLOCK') {
    body.scale.set(0.55, 1, 1);
    stock.visible = false;
  }

  g.rotation.y = Math.PI / 2;
  return g;
}

export function animateCharacter(char, moving, dt, prone) {
  const ud = char.userData;
  if (!ud) return;
  if (prone) {
    ud.body.rotation.x = -Math.PI / 2.2;
    ud.body.position.y = 0.35;
    return;
  }
  ud.body.rotation.x = 0;
  ud.body.position.y = 0;
  if (moving) {
    ud.animPhase += dt * 10;
    const s = Math.sin(ud.animPhase);
    ud.legL.rotation.x = s * 0.5;
    ud.legR.rotation.x = -s * 0.5;
    ud.armL.rotation.x = -s * 0.4;
    ud.armR.rotation.x = s * 0.4;
  } else {
    ud.legL.rotation.x *= 0.8;
    ud.legR.rotation.x *= 0.8;
    ud.armL.rotation.x *= 0.8;
    ud.armR.rotation.x *= 0.8;
  }
}

export function createWeaponCrate(weaponId) {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.7, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.6, metalness: 0.2 })
  );
  crate.position.y = 0.35;
  crate.castShadow = true;
  g.add(crate);

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.1, 0.85),
    new THREE.MeshStandardMaterial({ color: 0xb8860b })
  );
  lid.position.y = 0.75;
  g.add(lid);

  // Glow ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.9, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);

  g.userData = { weaponId, type: 'crate', bob: Math.random() * Math.PI * 2 };
  return g;
}
