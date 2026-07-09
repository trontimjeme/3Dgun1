import * as THREE from 'three';
import { buildMap, createSky, resolveCollision } from './map.js';
import { createCharacter, createWeaponMesh, animateCharacter, createWeaponCrate } from './character.js';
import { Controls } from './controls.js';
import { WEAPONS } from './weapons.js';
import { createLocalSocket } from './localServer.js';

const canvas = document.getElementById('game-canvas');
const $ = (id) => document.getElementById(id);

let socket = null;
let myId = null;
let room = null;
let localPlayer = null;

const state = {
  screen: 'menu',
  mode: null, // online | bot
  droneMode: false,
  droneAngle: 0,
  playing: false,
  mapData: null,
  scene: null,
  camera: null,
  renderer: null,
  characters: new Map(),
  crates: new Map(),
  controls: null,
  clock: new THREE.Clock(),
  velocityY: 0,
  onGround: true,
  eyeHeight: 1.6,
  muzzleFlash: null,
  tracers: [],
};

// ——— UI helpers ———
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  state.screen = id;
}

function setHud(visible) {
  $('game-hud').classList.toggle('hidden', !visible);
}

function msg(text, ms = 2500) {
  const el = $('game-messages');
  el.textContent = text;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, ms);
}

function addChat(data) {
  const box = $('chat-messages');
  if (!box) return;
  const line = document.createElement('div');
  line.className = 'chat-line' + (data.system ? ' system' : '');
  if (data.system) line.textContent = data.text;
  else line.innerHTML = `<span class="who">${escapeHtml(data.name)}:</span> ${escapeHtml(data.text)}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function playerName() {
  return ($('player-name').value || 'Operative').trim().slice(0, 16);
}

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function updateLobbyUI(snap) {
  room = snap;
  $('lobby-code').textContent = snap.code;
  const ct = $('ct-list');
  const t = $('t-list');
  ct.innerHTML = '';
  t.innerHTML = '';
  for (const p of snap.players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<span>${escapeHtml(p.name)}${p.isBot ? ' <span class="bot-tag">BOT</span>' : ''}${p.id === snap.hostId ? ' ★' : ''}</span>
      <span class="${p.ready ? 'ready' : ''}">${p.ready ? 'Sẵn sàng' : '...'}</span>`;
    (p.team === 'CT' ? ct : t).appendChild(row);
  }
  const isHost = snap.hostId === myId;
  $('btn-start-game').classList.toggle('hidden', !isHost);
  $('btn-fill-bots').classList.toggle('hidden', !isHost);
}

function updateHudFromPlayer(p, snap) {
  if (!p) return;
  const badge = $('team-badge');
  badge.textContent = p.team;
  badge.classList.toggle('t', p.team === 'T');
  $('score-ct').textContent = snap?.scores?.CT ?? 0;
  $('score-t').textContent = snap?.scores?.T ?? 0;
  if (snap?.timer != null) {
    $('timer-display').textContent = formatTime(snap.timer);
    $('timer-display').classList.toggle('urgent', snap.timer < 60);
  }
  const ctA = snap?.players?.filter((x) => x.team === 'CT' && x.alive).length ?? 0;
  const tA = snap?.players?.filter((x) => x.team === 'T' && x.alive).length ?? 0;
  $('alive-count').textContent = `${ctA} vs ${tA}`;

  const w = p.weapon ? WEAPONS[p.weapon.id] : null;
  $('weapon-name').textContent = w ? w.name : 'Chưa có súng — nhặt hộp!';
  $('ammo-clip').textContent = p.weapon?.clip ?? 0;
  $('ammo-reserve').textContent = p.weapon?.reserve ?? 0;
  $('hp-text').textContent = Math.max(0, Math.round(p.hp));
  $('hp-fill').style.width = `${Math.max(0, p.hp)}%`;
  $('crosshair').classList.toggle('ads', !!p.ads);
  $('scope-overlay')?.classList.toggle('hidden', !p.ads);

  // Dual weapon slots
  const slots = p.loadout?.slots || [];
  const active = p.loadout?.active ?? 0;
  const s0 = $('slot-0');
  const s1 = $('slot-1');
  if (s0) {
    s0.textContent = slots[0] ? (WEAPONS[slots[0].id]?.name || slots[0].id) : '—';
    s0.classList.toggle('on', active === 0 && !!slots[0]);
  }
  if (s1) {
    s1.textContent = slots[1] ? (WEAPONS[slots[1].id]?.name || slots[1].id) : '—';
    s1.classList.toggle('on', active === 1 && !!slots[1]);
  }
}

// ——— Three.js setup ———
function initThree() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (e) {
    // Fallback without antialias (some GPUs / remote desktops)
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, failIfMajorPerformanceCaveat: false });
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  createSky(scene);
  const mapData = buildMap(scene);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 40, 50);

  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.mapData = mapData;
  state.controls = new Controls();

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function clearEntities() {
  for (const [, ch] of state.characters) state.scene.remove(ch);
  state.characters.clear();
  for (const [, c] of state.crates) state.scene.remove(c);
  state.crates.clear();
}

function syncPlayers(players) {
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    let ch = state.characters.get(p.id);
    if (!ch) {
      ch = createCharacter(p.team, p.id.charCodeAt(0));
      state.scene.add(ch);
      state.characters.set(p.id, ch);
    }
    // Don't override local player transform while playing (we predict)
    if (p.id === myId && state.playing && !state.droneMode) {
      ch.visible = false;
      continue;
    }
    ch.position.set(p.x, p.y, p.z);
    ch.rotation.y = p.yaw;
    ch.visible = p.alive;
    if (p.prone) animateCharacter(ch, false, 0, true);
    // Weapon mesh
    const mount = ch.userData.weaponMount;
    const wid = p.weapon?.id;
    if (wid && mount.userData.wid !== wid) {
      while (mount.children.length) mount.remove(mount.children[0]);
      mount.add(createWeaponMesh(wid));
      mount.userData.wid = wid;
    } else if (!wid && mount.children.length) {
      while (mount.children.length) mount.remove(mount.children[0]);
      mount.userData.wid = null;
    }
  }
  for (const id of state.characters.keys()) {
    if (!seen.has(id)) {
      state.scene.remove(state.characters.get(id));
      state.characters.delete(id);
    }
  }
}

function syncCrates(crates) {
  const seen = new Set();
  for (const c of crates) {
    if (c.taken) {
      if (state.crates.has(c.id)) {
        state.scene.remove(state.crates.get(c.id));
        state.crates.delete(c.id);
      }
      continue;
    }
    seen.add(c.id);
    let mesh = state.crates.get(c.id);
    if (!mesh) {
      mesh = createWeaponCrate(c.weaponId);
      mesh.position.set(c.x, 0, c.z);
      state.scene.add(mesh);
      state.crates.set(c.id, mesh);
    }
  }
  for (const id of [...state.crates.keys()]) {
    if (!seen.has(id)) {
      state.scene.remove(state.crates.get(id));
      state.crates.delete(id);
    }
  }
}

function startDroneView(snap) {
  state.droneMode = true;
  state.playing = false;
  state.droneAngle = 0;
  state.controls.enabled = false;
  setHud(true);
  $('drone-banner').classList.remove('hidden');
  $('countdown-overlay').classList.add('hidden');
  syncPlayers(snap.players);
  syncCrates(snap.crates);
  const me = snap.players.find((p) => p.id === myId);
  localPlayer = me ? { ...me } : null;
  updateHudFromPlayer(localPlayer, snap);
  msg('Drone toàn cảnh — xem map trước khi vào trận', 4000);
}

function startPlaying(snap) {
  state.droneMode = false;
  state.playing = true;
  state.controls.enabled = true;
  state.controls.scopeLevel = 0;
  state.controls.ads = false;
  $('drone-banner').classList.add('hidden');
  syncPlayers(snap.players);
  syncCrates(snap.crates);
  const me = snap.players.find((p) => p.id === myId);
  if (me) {
    localPlayer = {
      ...me,
      x: me.x, y: me.y, z: me.z,
      yaw: me.yaw, pitch: me.pitch || 0,
      loadout: me.loadout,
      weapon: me.weapon,
    };
  }
  // Countdown
  let n = 3;
  $('countdown-overlay').classList.remove('hidden');
  $('countdown-num').textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      $('countdown-overlay').classList.add('hidden');
      if (snap.soloMode) {
        msg('1 vs 10 — Bạn có AWP + AK47 · nhấn V để đổi súng!', 4000);
      } else {
        msg(localPlayer?.team === 'CT' ? 'BẢO VỆ — Tiêu diệt Terrorist!' : 'TẤN CÔNG — Tiêu diệt CT!', 3000);
      }
    } else {
      $('countdown-num').textContent = n;
    }
  }, 700);
  updateHudFromPlayer(localPlayer, snap);
}

// ——— Networking ———
function wireSocketEvents(sock) {
  sock.on('room:update', (snap) => updateLobbyUI(snap));
  sock.on('chat', addChat);

  sock.on('round:drone', (snap) => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    room = snap;
    startDroneView(snap);
  });

  sock.on('round:start', (snap) => {
    room = snap;
    startPlaying(snap);
  });

  sock.on('game:tick', (data) => {
    if (!state.playing && !state.droneMode) return;
    if (room) {
      room.timer = data.timer;
      if (data.players) room.players = data.players;
      if (data.crates) room.crates = data.crates;
    }
    if (data.players) {
      for (const p of data.players) {
        if (p.id === myId && localPlayer) {
          localPlayer.hp = p.hp;
          localPlayer.alive = p.alive;
          if (p.weapon) localPlayer.weapon = p.weapon;
          if (p.loadout) localPlayer.loadout = p.loadout;
          localPlayer.kills = p.kills;
          localPlayer.deaths = p.deaths;
        }
      }
      syncPlayers(data.players);
      if (localPlayer && state.playing) {
        const ch = state.characters.get(myId);
        if (ch) {
          ch.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
          ch.rotation.y = localPlayer.yaw;
          ch.visible = localPlayer.alive;
          animateCharacter(ch, false, 0, localPlayer.prone);
          const mount = ch.userData.weaponMount;
          const wid = localPlayer.weapon?.id;
          if (wid && mount.userData.wid !== wid) {
            while (mount.children.length) mount.remove(mount.children[0]);
            mount.add(createWeaponMesh(wid));
            mount.userData.wid = wid;
          }
        }
      }
    }
    if (data.crates) syncCrates(data.crates);
    updateHudFromPlayer(localPlayer, { ...room, timer: data.timer, players: data.players, scores: room?.scores });
    if (room) room.timer = data.timer;
  });

  sock.on('crate:picked', (r) => {
    if (r.playerId === myId && localPlayer) {
      if (r.loadout) localPlayer.loadout = r.loadout;
      localPlayer.weapon = localPlayer.loadout?.slots?.[localPlayer.loadout.active]
        || {
          id: r.weaponId,
          clip: WEAPONS[r.weaponId].clipSize,
          reserve: WEAPONS[r.weaponId].reserve,
          lastShot: 0,
          reloading: false,
        };
      msg(`Nhặt được ${WEAPONS[r.weaponId].name}!`, 2000);
      updateHudFromPlayer(localPlayer, room);
    }
  });

  sock.on('weapon:switch', (r) => {
    if (r.playerId === myId && localPlayer) {
      if (localPlayer.loadout) localPlayer.loadout.active = r.active;
      localPlayer.weapon = localPlayer.loadout?.slots?.[r.active] || localPlayer.weapon;
      if (localPlayer.weapon) localPlayer.weapon.id = r.weaponId;
      msg(`Đổi sang ${WEAPONS[r.weaponId]?.name || r.weaponId}`, 1200);
      updateHudFromPlayer(localPlayer, room);
    }
  });

  sock.on('shot', (result) => {
    spawnTracer(result.origin, result.dir);
    if (result.hit && result.hit.id === myId && localPlayer) {
      localPlayer.hp = result.hit.hp;
      if (result.killed) {
        localPlayer.alive = false;
        msg('Bạn đã bị hạ!', 3000);
      }
      updateHudFromPlayer(localPlayer, room);
    }
  });

  sock.on('kill', (k) => {
    const feed = $('kill-feed');
    const line = document.createElement('div');
    line.className = 'kill-line';
    line.textContent = `${k.killer} [${k.weaponId}] ${k.victim}`;
    feed.prepend(line);
    setTimeout(() => line.remove(), 4000);
  });

  sock.on('reload', (r) => {
    if (r.playerId === myId) msg('Đang nạp đạn...', r.duration * 1000);
  });

  sock.on('round:end', (data) => {
    state.playing = false;
    state.controls.enabled = false;
    document.exitPointerLock?.();
    const title = data.winner === 'CT' ? 'CT THẮNG!' : 'TERRORIST THẮNG!';
    $('result-title').textContent = title;
    $('result-detail').textContent =
      data.winner === 'CT'
        ? 'Counter-Terrorist đã bảo vệ thành công / hết giờ.'
        : 'Terrorist đã tiêu diệt toàn bộ CT.';
    $('result-overlay').classList.remove('hidden');
    setHud(false);
  });
}

function useLocalMode(reason) {
  socket = createLocalSocket();
  myId = socket.id;
  wireSocketEvents(socket);
  $('conn-status').textContent = reason || 'Chế độ offline (bot) — sẵn sàng';
  return Promise.resolve();
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const url = (window.GAME_SERVER_URL || '').trim();

    // No remote server configured (typical on Vercel static) → offline bots
    if (!url && typeof io === 'undefined') {
      useLocalMode('Chế độ offline — chơi bot không cần server').then(resolve);
      return;
    }

    if (!url) {
      // Same-origin: try local Node server first, fall back to offline
      try {
        socket = io({ transports: ['websocket', 'polling'], timeout: 2500, reconnection: false });
      } catch (e) {
        useLocalMode('Chế độ offline — chơi bot').then(resolve);
        return;
      }
    } else {
      if (typeof io === 'undefined') {
        useLocalMode('Thiếu Socket.io client — dùng offline bot').then(resolve);
        return;
      }
      socket = io(url, { transports: ['websocket', 'polling'], timeout: 4000, reconnection: false });
    }

    let settled = false;
    const ok = () => {
      if (settled) return;
      settled = true;
      myId = socket.id;
      wireSocketEvents(socket);
      $('conn-status').textContent = 'Đã kết nối server';
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      try { socket.disconnect(); } catch (_) {}
      useLocalMode('Không có game server — chạy bot offline').then(resolve);
    };

    socket.on('connect', ok);
    socket.on('connect_error', fail);
    setTimeout(fail, 3000);
  });
}

function spawnTracer(origin, dir) {
  if (!origin || !dir) return;
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(origin.x, origin.y, origin.z),
    new THREE.Vector3(origin.x + dir.x * 40, origin.y + dir.y * 40, origin.z + dir.z * 40),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.8 }));
  state.scene.add(line);
  state.tracers.push({ mesh: line, life: 0.08 });
}

function updateViewmodel(player) {
  if (!state.viewmodel) {
    state.viewmodel = new THREE.Group();
    state.camera.add(state.viewmodel);
    state.scene.add(state.camera);
  }
  const wid = player.weapon?.id;
  if (state.viewmodel.userData.wid !== wid) {
    while (state.viewmodel.children.length) {
      const c = state.viewmodel.children[0];
      state.viewmodel.remove(c);
    }
    if (wid) {
      const mesh = createWeaponMesh(wid);
      mesh.scale.set(0.45, 0.45, 0.45);
      mesh.rotation.set(0.1, Math.PI, 0.05);
      mesh.position.set(0.28, -0.28, -0.55);
      state.viewmodel.add(mesh);
    }
    state.viewmodel.userData.wid = wid || null;
  }
  const ads = player.ads;
  state.viewmodel.position.x = ads ? -0.22 : 0;
  state.viewmodel.position.y = ads ? 0.08 : 0;
  state.viewmodel.position.z = ads ? 0.12 : 0;
}

// ——— Local simulation ———
function updateLocal(dt) {
  if (!localPlayer || !localPlayer.alive || !state.playing || state.droneMode) return;
  const ctrl = state.controls;
  ctrl.update();

  const look = ctrl.consumeLook();
  const sens = localPlayer.ads ? 0.0012 : 0.0022;
  localPlayer.yaw -= look.x * sens;
  localPlayer.pitch -= look.y * sens;
  localPlayer.pitch = Math.max(-1.3, Math.min(1.3, localPlayer.pitch));
  localPlayer.prone = ctrl.prone;
  localPlayer.ads = ctrl.ads;
  localPlayer.sprinting = ctrl.sprinting;

  let speed = 6.5;
  if (localPlayer.prone) speed = 2.2;
  else if (localPlayer.ads) speed = 3.5;
  else if (localPlayer.sprinting) speed = 9.5;
  const forward = new THREE.Vector3(Math.sin(localPlayer.yaw), 0, Math.cos(localPlayer.yaw));
  const right = new THREE.Vector3(Math.sin(localPlayer.yaw + Math.PI / 2), 0, Math.cos(localPlayer.yaw + Math.PI / 2));
  const mx = ctrl.move.x;
  const my = ctrl.move.y;
  if (mx || my) {
    localPlayer.x += (forward.x * my + right.x * mx) * speed * dt;
    localPlayer.z += (forward.z * my + right.z * mx) * speed * dt;
  }

  // Jump
  if (ctrl.consumePress('jump') && state.onGround && !localPlayer.prone) {
    state.velocityY = 7;
    state.onGround = false;
  }
  state.velocityY -= 18 * dt;
  localPlayer.y += state.velocityY * dt;
  if (localPlayer.y <= 0) {
    localPlayer.y = 0;
    state.velocityY = 0;
    state.onGround = true;
  }

  // Bounds + collision
  const b = state.mapData.bounds;
  localPlayer.x = Math.max(b.minX, Math.min(b.maxX, localPlayer.x));
  localPlayer.z = Math.max(b.minZ, Math.min(b.maxZ, localPlayer.z));
  const pos = new THREE.Vector3(localPlayer.x, localPlayer.y, localPlayer.z);
  resolveCollision(pos, 0.35, localPlayer.prone ? 0.6 : 1.7, state.mapData.colliders);
  localPlayer.x = pos.x;
  localPlayer.z = pos.z;

  // Character visual — hide own body in first-person
  const ch = state.characters.get(myId);
  if (ch) {
    ch.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
    ch.rotation.y = localPlayer.yaw;
    animateCharacter(ch, !!(mx || my), dt, localPlayer.prone);
    ch.visible = false;
  }

  // Camera first-person
  const eye = localPlayer.prone ? 0.45 : 1.65;
  state.eyeHeight = eye;
  state.camera.position.set(localPlayer.x, localPlayer.y + eye, localPlayer.z);
  const lookAt = new THREE.Vector3(
    localPlayer.x + Math.sin(localPlayer.yaw) * Math.cos(localPlayer.pitch),
    localPlayer.y + eye + Math.sin(localPlayer.pitch),
    localPlayer.z + Math.cos(localPlayer.yaw) * Math.cos(localPlayer.pitch)
  );
  state.camera.lookAt(lookAt);
  state.camera.fov = ctrl.fovForScope(75);
  state.camera.updateProjectionMatrix();

  // First-person weapon viewmodel
  updateViewmodel(localPlayer);

  // Actions
  if (ctrl.consumePress('reload') && localPlayer.weapon) {
    socket.emit('player:reload');
  }
  if (ctrl.consumePress('pickup')) tryPickup();
  if (ctrl.consumePress('switchWeapon')) {
    socket.emit('player:switchWeapon');
    // Optimistic local switch
    if (localPlayer.loadout?.slots?.length > 1) {
      if (localPlayer.weapon) localPlayer.loadout.slots[localPlayer.loadout.active] = localPlayer.weapon;
      localPlayer.loadout.active = (localPlayer.loadout.active + 1) % localPlayer.loadout.slots.length;
      localPlayer.weapon = localPlayer.loadout.slots[localPlayer.loadout.active];
      msg(`Đổi sang ${WEAPONS[localPlayer.weapon.id]?.name}`, 1000);
    }
  }
  if (ctrl.consumePress('drone')) toggleDronePeek();

  // Fire
  const wantFire = ctrl.fire || ctrl.consumePress('fire');
  if (wantFire) tryShoot();

  // Sync to server
  socket.emit('player:update', {
    x: localPlayer.x,
    y: localPlayer.y,
    z: localPlayer.z,
    yaw: localPlayer.yaw,
    pitch: localPlayer.pitch,
    prone: localPlayer.prone,
    ads: localPlayer.ads,
    sprinting: localPlayer.sprinting,
  });

  updateHudFromPlayer(localPlayer, room);
}

function tryPickup() {
  if (!localPlayer) return;
  let best = null;
  let bestD = 2.2;
  for (const [id, mesh] of state.crates) {
    const d = Math.hypot(mesh.position.x - localPlayer.x, mesh.position.z - localPlayer.z);
    if (d < bestD) { bestD = d; best = id; }
  }
  if (best) socket.emit('player:pickup', { crateId: best });
  else msg('Không có hộp súng gần đây', 1200);
}

function tryShoot() {
  if (!localPlayer?.weapon || localPlayer.weapon.reloading) return;
  const w = WEAPONS[localPlayer.weapon.id];
  if (!w || localPlayer.weapon.clip <= 0) {
    if (localPlayer.weapon?.clip <= 0) msg('Hết đạn — nạp đạn!', 1000);
    return;
  }
  const now = performance.now() / 1000;
  if (now - (localPlayer.weapon.lastShot || 0) < w.fireRate) return;
  localPlayer.weapon.lastShot = now;
  // Optimistic clip
  localPlayer.weapon.clip = Math.max(0, localPlayer.weapon.clip - 1);

  const spread = localPlayer.ads ? w.adsSpread : w.spread;
  const yaw = localPlayer.yaw + (Math.random() - 0.5) * spread * 2;
  const pitch = localPlayer.pitch + (Math.random() - 0.5) * spread * 2;
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
  const origin = {
    x: localPlayer.x,
    y: localPlayer.y + state.eyeHeight,
    z: localPlayer.z,
  };

  // Client-side raycast for hit detection hint
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(origin.x, origin.y, origin.z),
    dir,
    0.5,
    w.range
  );
  let hitPlayerId = null;
  let hitDist = Infinity;
  for (const [id, ch] of state.characters) {
    if (id === myId || !ch.visible) continue;
    const remote = room?.players?.find((x) => x.id === id);
    if (remote && remote.team === localPlayer.team) continue;
    if (remote && !remote.alive) continue;
    const hits = raycaster.intersectObject(ch, true);
    if (hits.length && hits[0].distance < hitDist) {
      hitDist = hits[0].distance;
      hitPlayerId = id;
    }
  }

  socket.emit('player:shoot', { origin, dir: { x: dir.x, y: dir.y, z: dir.z }, hitPlayerId });
  spawnTracer(origin, { x: dir.x, y: dir.y, z: dir.z });
}

function toggleDronePeek() {
  if (!state.playing) return;
  state.droneMode = !state.droneMode;
  if (state.droneMode) {
    $('drone-banner').classList.remove('hidden');
    $('drone-banner').textContent = 'CAMERA TOÀN CẢNH — Nhấn Drone để quay lại';
    state.controls.enabled = false;
  } else {
    $('drone-banner').classList.add('hidden');
    state.controls.enabled = true;
  }
}

function updateDrone(dt) {
  state.droneAngle += dt * 0.35;
  const r = 42;
  const h = 32;
  const x = Math.cos(state.droneAngle) * r;
  const z = Math.sin(state.droneAngle) * r;
  state.camera.position.set(x, h, z);
  state.camera.lookAt(0, 2, 0);
  state.camera.fov = 55;
  state.camera.updateProjectionMatrix();

  // Bob crates
  for (const [, mesh] of state.crates) {
    mesh.userData.bob += dt * 2;
    mesh.position.y = Math.sin(mesh.userData.bob) * 0.1;
    mesh.rotation.y += dt * 0.8;
  }
}

function updateTracers(dt) {
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    const t = state.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      state.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      state.tracers.splice(i, 1);
    }
  }
}

function animateRemote(dt) {
  for (const [id, ch] of state.characters) {
    if (id === myId && state.playing && !state.droneMode) continue;
    animateCharacter(ch, true, dt * 0.3, false);
  }
  for (const [, mesh] of state.crates) {
    mesh.userData.bob = (mesh.userData.bob || 0) + dt * 2;
    mesh.position.y = Math.sin(mesh.userData.bob) * 0.12;
    mesh.rotation.y += dt * 0.6;
  }
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, state.clock.getDelta());
  if (state.droneMode) updateDrone(dt);
  else if (state.playing) updateLocal(dt);
  else {
    // Idle menu camera orbit
    if (state.screen === 'main-menu' || state.screen === 'menu') {
      state.droneAngle += dt * 0.15;
      state.camera.position.set(Math.cos(state.droneAngle) * 48, 28, Math.sin(state.droneAngle) * 48);
      state.camera.lookAt(0, 2, -5);
    }
  }
  animateRemote(dt);
  updateTracers(dt);
  state.renderer.render(state.scene, state.camera);
}

// ——— Menu bindings ———
function bindUI() {
  $('btn-create-room').onclick = async () => {
    try {
      await ensureConnected();
      socket.emit('room:create', { name: playerName() }, (res) => {
        if (!res?.ok) return alert(res?.error || 'Lỗi');
        myId = socket.id;
        updateLobbyUI(res.room);
        showScreen('lobby-screen');
        $('chat-messages').innerHTML = '';
        addChat({ system: true, text: 'Phòng đã tạo. Chia sẻ mã để mời bạn bè.' });
      });
    } catch {
      alert('Không kết nối được server. Chạy: npm start');
    }
  };

  $('btn-join-room').onclick = () => showScreen('join-screen');
  $('btn-back-join').onclick = () => showScreen('main-menu');
  $('btn-confirm-join').onclick = async () => {
    try {
      await ensureConnected();
      const code = $('room-code-input').value.trim().toUpperCase();
      socket.emit('room:join', { code, name: playerName() }, (res) => {
        if (!res?.ok) return alert(res?.error || 'Lỗi');
        myId = socket.id;
        updateLobbyUI(res.room);
        showScreen('lobby-screen');
      });
    } catch {
      alert('Không kết nối được server');
    }
  };

  $('btn-bot-game').onclick = async () => {
    const btn = $('btn-bot-game');
    btn.disabled = true;
    $('conn-status').textContent = 'Đang kết nối server...';
    try {
      await ensureConnected();
      socket.emit('room:bot', { name: playerName(), mode: '5v5' }, (res) => {
        btn.disabled = false;
        if (!res?.ok) {
          $('conn-status').textContent = res?.error || 'Lỗi tạo phòng bot';
          return alert(res?.error || 'Lỗi');
        }
        myId = socket.id;
        room = res.room;
        updateLobbyUI(res.room);
        $('conn-status').textContent = 'Đã vào phòng bot 5v5 — chờ drone...';
        msg('Đang vào trận với bot...', 2000);
      });
    } catch (err) {
      btn.disabled = false;
      console.error(err);
      $('conn-status').textContent = 'Không kết nối được. Chạy: npm start rồi mở http://localhost:3000';
      alert('Không kết nối được server.\n\n1) Mở terminal trong thư mục game\n2) Chạy: npm install && npm start\n3) Mở trình duyệt: http://localhost:3000\n\n(Không mở file index.html trực tiếp)');
    }
  };

  $('btn-solo-10').onclick = async () => {
    const btn = $('btn-solo-10');
    btn.disabled = true;
    $('conn-status').textContent = 'Đang tạo 1 vs 10...';
    try {
      await ensureConnected();
      socket.emit('room:bot', { name: playerName(), mode: 'solo10' }, (res) => {
        btn.disabled = false;
        if (!res?.ok) {
          $('conn-status').textContent = res?.error || 'Lỗi';
          return alert(res?.error || 'Lỗi');
        }
        myId = socket.id;
        room = res.room;
        $('conn-status').textContent = '1 vs 10 — AWP + AK47 sẵn sàng · V đổi súng';
        msg('1 đấu 10 bot — trang bị AWP & AK47', 2500);
      });
    } catch (err) {
      btn.disabled = false;
      console.error(err);
      $('conn-status').textContent = 'Không kết nối được server';
      alert('Không kết nối được server. Chạy npm start rồi mở http://localhost:3000');
    }
  };

  $('btn-join-ct').onclick = () => socket?.emit('room:team', { team: 'CT' });
  $('btn-join-t').onclick = () => socket?.emit('room:team', { team: 'T' });
  $('btn-ready').onclick = () => {
    const p = room?.players?.find((x) => x.id === myId);
    socket?.emit('room:ready', { ready: !p?.ready });
  };
  $('btn-fill-bots').onclick = () => socket?.emit('room:fillBots');
  $('btn-start-game').onclick = () => socket?.emit('room:start');
  $('btn-leave-lobby').onclick = () => {
    socket?.disconnect();
    socket = null;
    showScreen('main-menu');
    $('conn-status').textContent = '';
  };
  $('btn-copy-code').onclick = () => {
    const code = $('lobby-code').textContent;
    navigator.clipboard?.writeText(code);
    msg('Đã copy mã phòng', 1500);
  };

  $('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket?.emit('chat', { text });
    input.value = '';
  };

  $('drone-banner').onclick = () => {
    if (room?.state === 'drone' || (!state.playing && state.droneMode)) {
      socket?.emit('round:skipDrone');
    } else {
      toggleDronePeek();
    }
  };

  $('btn-result-menu').onclick = () => {
    $('result-overlay').classList.add('hidden');
    clearEntities();
    socket?.disconnect();
    socket = null;
    setHud(false);
    showScreen('main-menu');
    state.playing = false;
    state.droneMode = false;
  };

  // Random default name
  const names = ['Ghost', 'Viper', 'Nova', 'Brick', 'Echo', 'Raptor', 'Shade', 'Bolt'];
  $('player-name').value = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 90);
}

let connecting = null;
function ensureConnected() {
  if (socket?.connected) return Promise.resolve();
  if (connecting) return connecting;
  $('conn-status').textContent = 'Đang kết nối...';
  connecting = connectSocket().finally(() => { connecting = null; });
  return connecting;
}

// Prefetch offline-ready status on menu
setTimeout(() => {
  if (!socket && $('conn-status') && !$('conn-status').textContent) {
    const hasRemote = !!(window.GAME_SERVER_URL || '').trim();
    if (!hasRemote) {
      $('conn-status').textContent = 'Sẵn sàng chơi bot (offline / Vercel)';
    }
  }
}, 300);

// ——— Boot ———
bindUI();
showScreen('main-menu');
setHud(false);

try {
  initThree();
  loop();
  console.log('Block Tactical 5v5 ready');
} catch (err) {
  console.error(err);
  const status = $('conn-status');
  if (status) {
    status.textContent = 'Lỗi WebGL / khởi tạo 3D. Hãy dùng Chrome/Edge và mở http://localhost:PORT (sau npm start).';
  }
  alert('Không tạo được WebGL. Mở game qua http://localhost sau khi chạy npm start (không mở file HTML trực tiếp).');
}
