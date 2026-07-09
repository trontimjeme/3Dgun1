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
function createRenderer() {
  const attempts = [
    { antialias: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false, alpha: false },
    { antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false, alpha: false },
    { antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false, alpha: false },
    { antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false, alpha: true },
  ];
  let lastErr = null;
  for (const opts of attempts) {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, ...opts });
      // Probe that context actually works
      const gl = renderer.getContext();
      if (!gl) throw new Error('null WebGL context');
      return renderer;
    } catch (e) {
      lastErr = e;
      console.warn('WebGL attempt failed', opts, e);
    }
  }
  // Last resort: fresh canvas if the page canvas is tainted / lost
  try {
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.id = 'game-canvas-fallback';
    fallbackCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;display:block;';
    canvas.style.display = 'none';
    canvas.parentNode.insertBefore(fallbackCanvas, canvas);
    const renderer = new THREE.WebGLRenderer({
      canvas: fallbackCanvas,
      antialias: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false,
    });
    return renderer;
  } catch (e) {
    lastErr = e;
  }
  throw lastErr || new Error('WebGL unavailable');
}

function initThree() {
  if (state.renderer) return true;

  const renderer = createRenderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  // Disable shadow maps by default for Vercel / integrated GPUs reliability
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  createSky(scene);
  const mapData = buildMap(scene);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
  // Start at ground-level spawn — never leave initial camera at aerial height
  camera.position.set(0, 1.65, 14);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = Math.PI;
  camera.rotation.x = 0;

  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.mapData = mapData;
  // Controls already created at boot — do not re-bind listeners

  window.addEventListener('resize', () => {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = innerWidth / innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(innerWidth, innerHeight);
  });

  // Recover from context loss (common with many Chrome tabs)
  const el = renderer.domElement;
  el.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost');
    $('conn-status').textContent = 'WebGL bị mất — đang thử khôi phục...';
  }, false);
  el.addEventListener('webglcontextrestored', () => {
    $('conn-status').textContent = 'WebGL đã khôi phục';
  }, false);

  return true;
}

/** Ensure 3D is ready before starting a match (call from button click). */
function ensureThree() {
  if (state.renderer) return true;
  try {
    initThree();
    if (!state._loopStarted) {
      state._loopStarted = true;
      loop();
    }
    return true;
  } catch (err) {
    console.error(err);
    const tip =
      'Không tạo được WebGL trên trình duyệt này.\n\n' +
      'Thử:\n' +
      '1) Đóng bớt tab Chrome (đặc biệt tab game khác)\n' +
      '2) Bật Hardware acceleration trong chrome://settings\n' +
      '3) Mở lại trang trong tab mới (không dùng preview nhỏ trên dashboard Vercel)\n' +
      '4) Dùng Chrome/Edge bản mới nhất';
    if ($('conn-status')) {
      $('conn-status').textContent = 'Lỗi WebGL — mở site trong tab mới, đóng tab game cũ, bật GPU acceleration.';
    }
    alert(tip);
    return false;
  }
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
    // Local player in FPS: hide body (you look through their eyes)
    if (p.id === myId && state.playing && !state.droneMode) {
      ch.visible = false;
      const mount = ch.userData.weaponMount;
      const wid = p.weapon?.id;
      if (wid && wid !== 'FIST' && mount.userData.wid !== wid) {
        while (mount.children.length) mount.remove(mount.children[0]);
        mount.add(createWeaponMesh(wid));
        mount.userData.wid = wid;
      } else if ((!wid || wid === 'FIST') && mount.children.length) {
        while (mount.children.length) mount.remove(mount.children[0]);
        mount.userData.wid = wid || null;
      }
      continue;
    }
    ch.position.set(p.x, p.y, p.z);
    ch.rotation.y = p.yaw;
    ch.visible = p.alive;
    if (p.id === myId && state.droneMode) {
      ch.scale.set(1.35, 1.35, 1.35);
      if (ch.userData.youMarker) ch.userData.youMarker.visible = true;
    } else {
      ch.scale.set(1, 1, 1);
      if (p.id !== myId && ch.userData.youMarker) ch.userData.youMarker.visible = false;
    }
    if (p.prone) animateCharacter(ch, false, 0, true);
    const mount = ch.userData.weaponMount;
    const wid = p.weapon?.id;
    if (wid && wid !== 'FIST' && mount.userData.wid !== wid) {
      while (mount.children.length) mount.remove(mount.children[0]);
      mount.add(createWeaponMesh(wid));
      mount.userData.wid = wid;
    } else if ((!wid || wid === 'FIST') && mount.children.length) {
      while (mount.children.length) mount.remove(mount.children[0]);
      mount.userData.wid = wid || null;
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

/** Drone/spectator intro removed — always enter as the character (FPS). */
function startDroneView(snap) {
  startPlaying(snap);
}

function findMe(players) {
  if (!players?.length) return null;
  // Prefer exact socket id
  let me = players.find((p) => p.id === myId);
  if (me) return me;
  // Fallback: only human (not bot)
  me = players.find((p) => !p.isBot);
  if (me) {
    myId = me.id; // re-bind so later sync works
    return me;
  }
  return players[0];
}

/** Bind or refresh localPlayer from the latest room snapshot. */
function ensureLocalPlayer(players) {
  const list = players || room?.players;
  const me = list?.length ? findMe(list) : null;

  if (!me) {
    // Keep existing controllable character if room snapshot momentarily lacks players
    return localPlayer || null;
  }

  if (!localPlayer || localPlayer.id !== me.id) {
    myId = me.id;
    localPlayer = {
      ...me,
      x: Number.isFinite(me.x) ? me.x : 0,
      y: me.y || 0,
      z: Number.isFinite(me.z) ? me.z : 14,
      yaw: Number.isFinite(me.yaw) ? me.yaw : Math.PI,
      pitch: me.pitch || 0,
      loadout: me.loadout,
      weapon: me.weapon,
      ads: false,
      prone: me.prone || false,
      sprinting: false,
      alive: me.alive !== false,
    };
  } else {
    localPlayer.hp = me.hp;
    localPlayer.alive = me.alive;
    if (me.weapon) localPlayer.weapon = me.weapon;
    if (me.loadout) localPlayer.loadout = me.loadout;
    if (Number.isFinite(me.x)) localPlayer.x = me.x;
    if (Number.isFinite(me.y)) localPlayer.y = me.y;
    if (Number.isFinite(me.z)) localPlayer.z = me.z;
    if (Number.isFinite(me.yaw)) localPlayer.yaw = me.yaw;
    if (me.pitch != null) localPlayer.pitch = me.pitch;
  }
  return localPlayer;
}

/** Who the camera should follow — never null during a live match. */
function getPlayerForCamera() {
  return ensureLocalPlayer() || localPlayer || {
    x: 0, y: 0, z: 14, yaw: Math.PI, pitch: 0, prone: false,
  };
}

function applyFpsCamera() {
  if (!state.camera) return;

  const p = getPlayerForCamera();
  const eye = p.prone ? 0.45 : 1.65;
  state.eyeHeight = eye;
  const yaw = p.yaw ?? Math.PI;
  const pitch = p.pitch || 0;
  const px = Number.isFinite(p.x) ? p.x : 0;
  const py = p.y || 0;
  const pz = Number.isFinite(p.z) ? p.z : 14;

  // FPS: camera is NEVER in the scene graph
  if (state.scene?.children.includes(state.camera)) {
    state.scene.remove(state.camera);
  }

  state.camera.position.set(px, py + eye, pz);
  state.camera.rotation.order = 'YXZ';
  state.camera.rotation.y = yaw;
  state.camera.rotation.x = pitch;
  state.camera.rotation.z = 0;
  state.camera.updateMatrixWorld(true);

  const fov = state.controls?.fovForScope?.(75) ?? 75;
  if (Math.abs(state.camera.fov - fov) > 0.01) {
    state.camera.fov = fov;
    state.camera.updateProjectionMatrix();
  }
}

function isStuckSpectatorView() {
  return state.camera && state.camera.position.y > 6;
}

/** Single entry: match started → you control the character in first-person. */
function enterPlayerView(snap) {
  if (snap) room = snap;
  state.droneMode = false;
  state.playing = true;
  state.screen = 'playing';
  if (state.controls) state.controls.enabled = true;
  showLegoControls();
  ensureLocalPlayer(snap?.players);
  applyFpsCamera();
}

function showLegoControls() {
  setHud(true);
  const tc = $('touch-controls');
  if (tc) {
    tc.classList.remove('hidden');
    tc.style.display = '';
    tc.style.visibility = 'visible';
    tc.style.opacity = '1';
    tc.style.pointerEvents = 'none'; // children keep pointer-events:auto
  }
  $('crosshair')?.classList.remove('hidden');
  $('drone-banner')?.classList.add('hidden');
  // Hide spectator drone button — match is always character POV
  const droneBtn = $('btn-drone-cam');
  if (droneBtn) droneBtn.classList.add('hidden');
}

function startPlaying(snap) {
  if (!ensureThree()) return;
  if (!snap) return;

  const me = findMe(snap.players);
  if (!me) {
    console.error('No local player', { myId, players: snap.players });
    state.playing = false;
    msg('Lỗi: không tìm thấy nhân vật của bạn', 5000);
    return;
  }

  // Already in character POV for this match — refresh HUD/camera only
  if (state.playing && localPlayer && !state.droneMode) {
    room = snap;
    enterPlayerView(snap);
    updateViewmodel(localPlayer);
    updateHudFromPlayer(localPlayer, snap);
    return;
  }

  room = snap;
  myId = me.id;
  localPlayer = {
    ...me,
    x: Number.isFinite(me.x) ? me.x : 0,
    y: me.y || 0,
    z: Number.isFinite(me.z) ? me.z : 14,
    yaw: Number.isFinite(me.yaw) ? me.yaw : Math.PI,
    pitch: me.pitch || 0,
    loadout: me.loadout,
    weapon: me.weapon,
    ads: false,
    prone: false,
    sprinting: false,
    alive: me.alive !== false,
  };

  // Only mark "playing" after we have a controllable character
  state.droneMode = false;
  state.playing = true;
  state.screen = 'playing';
  state.thirdPerson = false;
  if (state.controls) {
    state.controls.enabled = true;
    state.controls.scopeLevel = 0;
    state.controls.ads = false;
  }
  state.combatReady = false;

  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  $('click-hint')?.classList.add('hidden');
  $('result-overlay')?.classList.add('hidden');
  showLegoControls();

  syncPlayers(snap.players || []);
  syncCrates(snap.crates || []);

  for (const [id, ch] of state.characters) {
    if (id === myId) {
      ch.visible = false;
      if (ch.userData.youMarker) ch.userData.youMarker.visible = false;
    }
  }

  applyFpsCamera();
  enterPlayerView(snap);
  if (state.viewmodel) state.viewmodel.visible = true;
  updateViewmodel(localPlayer);

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) {
    try { document.getElementById('game-canvas')?.requestPointerLock?.(); } catch (_) {}
    $('click-hint')?.classList.remove('hidden');
  }

  if (state._countdownIv) clearInterval(state._countdownIv);
  let n = 3;
  $('countdown-overlay').classList.remove('hidden');
  $('countdown-num').textContent = n;
  state._countdownIv = setInterval(() => {
    if (!state.playing) { clearInterval(state._countdownIv); return; }
    n--;
    if (n <= 0) {
      clearInterval(state._countdownIv);
      state._countdownIv = null;
      $('countdown-overlay').classList.add('hidden');
      state.combatReady = true;
      msg('BẠN LÀ NHÂN VẬT — joystick / WASD · nhìn · BẮN', 4000);
      if (!isTouch) {
        try { document.getElementById('game-canvas')?.requestPointerLock?.(); } catch (_) {}
      }
    } else {
      $('countdown-num').textContent = n;
    }
  }, 700);
  updateHudFromPlayer(localPlayer, snap);
  console.log('FPS + LEGO controls locked', { myId, x: localPlayer.x, z: localPlayer.z, weapon: localPlayer.weapon?.id, camY: state.camera?.position.y });
}

// ——— Networking ———
function wireSocketEvents(sock) {
  sock.on('room:update', (snap) => updateLobbyUI(snap));
  sock.on('chat', addChat);

  sock.on('round:drone', (snap) => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    startPlaying(snap);
  });

  sock.on('round:start', (snap) => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    startPlaying(snap);
  });

  sock.on('game:tick', (data) => {
    const matchRunning = data?.state === 'playing' || room?.state === 'playing' || data?.timer != null;

    if (!state.playing && matchRunning && data?.players?.length) {
      console.warn('Recover player POV from game:tick');
      startPlaying({
        ...(room || {}),
        state: 'playing',
        timer: data.timer,
        players: data.players,
        crates: data.crates || room?.crates || [],
        scores: room?.scores || { CT: 0, T: 0 },
        soloMode: room?.soloMode,
      });
      return;
    }

    if (!state.playing) return;

    state.droneMode = false;
    enterPlayerView();

    if (room) {
      room.timer = data.timer;
      room.state = 'playing';
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
      if (localPlayer) {
        const ch = state.characters.get(myId);
        if (ch) ch.visible = false;
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
  return new Promise((resolve) => {
    const url = (window.GAME_SERVER_URL || '').trim();

    // Vercel / static: never probe same-origin Socket.io (it hangs and never starts FPS).
    // Only connect remotely when GAME_SERVER_URL is explicitly set.
    if (!url) {
      useLocalMode('Chế độ offline (bot) — sẵn sàng').then(resolve);
      return;
    }

    if (typeof io === 'undefined') {
      useLocalMode('Thiếu Socket.io — dùng offline bot').then(resolve);
      return;
    }

    try {
      socket = io(url, { transports: ['websocket', 'polling'], timeout: 4000, reconnection: false });
    } catch (e) {
      useLocalMode('Không kết nối được server — offline bot').then(resolve);
      return;
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
    setTimeout(fail, 2500);
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
  if (!state.camera) return;
  if (!state.viewmodel) {
    state.viewmodel = new THREE.Group();
    // Viewmodel is a child of camera — camera must NOT be added to scene
    state.camera.add(state.viewmodel);
    if (state.scene?.children.includes(state.camera)) {
      state.scene.remove(state.camera);
    }
  }
  const wid = player.weapon?.id;
  if (wid === 'FIST') {
    // Hide gun viewmodel for fists
    while (state.viewmodel.children.length) state.viewmodel.remove(state.viewmodel.children[0]);
    state.viewmodel.userData.wid = 'FIST';
    return;
  }
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
  if (!state.playing) return;
  ensureLocalPlayer();
  if (!localPlayer) return;

  // Hard-lock: never allow spectator orbit mid-match
  state.droneMode = false;

  const ctrl = state.controls;
  if (!ctrl.enabled || !localPlayer.alive) {
    applyFpsCamera();
    if (state.viewmodel) state.viewmodel.visible = !!localPlayer.alive;
    updateHudFromPlayer(localPlayer, room);
    return;
  }

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

  // Character body hidden in FPS — you look through their eyes
  const ch = state.characters.get(myId);
  if (ch) {
    ch.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
    ch.rotation.y = localPlayer.yaw;
    animateCharacter(ch, !!(mx || my), dt, localPlayer.prone);
    ch.visible = false;
  }

  applyFpsCamera();

  // Gun in hands (FPS viewmodel)
  if (state.viewmodel) state.viewmodel.visible = true;
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
  // Ignore drone peek — stay in character POV
  if (ctrl.consumePress('drone')) {
    msg('Chỉ góc nhìn nhân vật — không dùng camera người xem', 1500);
  }

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
  if (!state.combatReady) return;
  if (!localPlayer?.weapon || localPlayer.weapon.reloading) return;
  const w = WEAPONS[localPlayer.weapon.id];
  if (!w || (!w.melee && localPlayer.weapon.clip <= 0)) {
    if (localPlayer.weapon?.clip <= 0 && !w?.melee) msg('Hết đạn — nạp đạn!', 1000);
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
  // Disabled: game is always character first-person POV
  state.droneMode = false;
  msg('Chỉ góc nhìn nhân vật', 1200);
}

function updateDrone(_dt) {
  // No-op — spectator orbit removed during matches
  state.droneMode = false;
  if (localPlayer && state.playing) applyFpsCamera();
}

function updateTracers(dt) {
  if (!state.scene) return;
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
  if (!state.scene) return;
  for (const [id, ch] of state.characters) {
    if (id === myId && state.playing) continue;
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
  if (!state.renderer || !state.scene || !state.camera) return;
  const dt = Math.min(0.05, state.clock.getDelta());

  const hudActive = !$('game-hud')?.classList.contains('hidden');
  const matchLive = state.playing || room?.state === 'playing' || hudActive;

  if (matchLive) {
    // RULE: during a match the camera is ALWAYS first-person — never menu/drone orbit
    state.playing = true;
    state.droneMode = false;
    state.screen = 'playing';
    ensureLocalPlayer();
    applyFpsCamera(); // apply BEFORE movement so we never render one frame at orbit height
    updateLocal(dt);
    applyFpsCamera(); // apply AFTER movement
    if (isStuckSpectatorView()) {
      console.warn('Spectator watchdog — forcing player POV', state.camera.position.y);
      applyFpsCamera();
    }
  } else if (
    !hudActive &&
    (state.screen === 'main-menu' || state.screen === 'menu' || state.screen === 'join-screen' || state.screen === 'lobby-screen')
  ) {
    state.droneAngle += dt * 0.15;
    state.camera.position.set(Math.cos(state.droneAngle) * 48, 28, Math.sin(state.droneAngle) * 48);
    state.camera.rotation.set(0, 0, 0);
    state.camera.lookAt(0, 2, -5);
  }

  animateRemote(dt);
  updateTracers(dt);
  state.renderer.render(state.scene, state.camera);
}

// ——— Menu bindings ———
function bindUI() {
  $('btn-create-room').onclick = async () => {
    if (!ensureThree()) return;
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
      alert('Online cần game server. Trên Vercel hãy chơi Bot offline.');
    }
  };

  $('btn-join-room').onclick = () => showScreen('join-screen');
  $('btn-back-join').onclick = () => showScreen('main-menu');
  $('btn-confirm-join').onclick = async () => {
    if (!ensureThree()) return;
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
      alert('Online cần game server. Trên Vercel hãy chơi Bot offline.');
    }
  };

  $('btn-bot-game').onclick = async () => {
    if (!ensureThree()) return;
    const btn = $('btn-bot-game');
    btn.disabled = true;
    $('conn-status').textContent = 'Đang vào trận bot (FPS)...';
    try {
      await ensureConnected();
      myId = socket.id;
      socket.emit('room:bot', { name: playerName(), mode: '5v5' }, (res) => {
        btn.disabled = false;
        if (!res?.ok) {
          $('conn-status').textContent = res?.error || 'Lỗi tạo phòng bot';
          return alert(res?.error || 'Lỗi');
        }
        myId = socket.id;
        room = res.room;
        $('conn-status').textContent = 'Bot 5v5 — góc nhìn nhân vật';
        // Enter FPS immediately from ack (do not wait for round:start)
        startPlaying(res.room);
      });
    } catch (err) {
      btn.disabled = false;
      console.error(err);
      $('conn-status').textContent = 'Lỗi khởi tạo trận';
      alert('Không vào được trận bot. Thử tải lại trang.');
    }
  };

  $('btn-solo-10').onclick = async () => {
    if (!ensureThree()) return;
    const btn = $('btn-solo-10');
    btn.disabled = true;
    $('conn-status').textContent = 'Đang vào trận FPS...';
    try {
      await ensureConnected();
      myId = socket.id;
      socket.emit('room:bot', { name: playerName(), mode: 'solo10' }, (res) => {
        btn.disabled = false;
        if (!res?.ok) {
          $('conn-status').textContent = res?.error || 'Lỗi';
          return alert(res?.error || 'Lỗi');
        }
        myId = socket.id;
        room = res.room;
        $('conn-status').textContent = '1 vs 10 — góc nhìn nhân vật';
        // Enter FPS immediately — ack already includes spawned snapshot
        startPlaying(res.room);
      });
    } catch (err) {
      btn.disabled = false;
      console.error(err);
      $('conn-status').textContent = 'Lỗi khởi tạo trận';
      alert('Không vào được trận. Thử tải lại trang trong tab mới.');
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
    // Always character POV — skip any leftover drone state
    if (!state.playing) {
      socket?.emit('round:skipDrone');
      return;
    }
    state.droneMode = false;
  };

  // Tap canvas during match — recover FPS if stuck in spectator height
  canvas.addEventListener('pointerdown', () => {
    if (!state.playing && state.droneMode) {
      socket?.emit('round:skipDrone');
      state.droneMode = false;
      return;
    }
    if (state.playing || room?.state === 'playing') {
      state.screen = 'playing';
      ensureLocalPlayer();
      applyFpsCamera();
      if (isStuckSpectatorView()) {
        msg('Đã khóa góc nhìn nhân vật', 1500);
      }
    }
  });

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
state.controls = new Controls(); // UI bindings before WebGL

// Warm up WebGL after first user gesture-friendly delay (menu still usable if it fails)
function bootGraphics() {
  try {
    initThree();
    state._loopStarted = true;
    loop();
    if ($('conn-status') && !$('conn-status').textContent) {
      $('conn-status').textContent = 'Sẵn sàng — bấm 1 đấu 10 Bot để chơi trên Vercel';
    }
    console.log('Block Tactical 5v5 ready');
  } catch (err) {
    console.warn('Deferred WebGL init failed; will retry on Play', err);
    if ($('conn-status')) {
      $('conn-status').textContent = 'Đồ họa chưa sẵn sàng — bấm chơi để thử lại (mở tab đầy đủ, đóng tab game cũ).';
    }
  }
}

// Prefer requestIdleCallback so the menu paints first on Vercel
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => bootGraphics(), { timeout: 1200 });
} else {
  setTimeout(bootGraphics, 100);
}
