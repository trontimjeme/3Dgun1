/**
 * Offline / Vercel-friendly local game host.
 * Mimics the Socket.io room API so bot modes work without a Node server.
 */
import { GameRoom, createRoomCode } from './room.js';

const SPAWNS = {
  CT: [
    { x: -4, z: 24 }, { x: 0, z: 24 }, { x: 4, z: 24 },
    { x: -6, z: 22 }, { x: 6, z: 22 },
  ],
  T: [
    { x: -4, z: -24 }, { x: 0, z: -22 }, { x: 4, z: -24 },
    { x: -8, z: -20 }, { x: 8, z: -20 },
  ],
};
const CRATE_SPOTS = [
  { x: 0, z: 10 }, { x: -10, z: 2 }, { x: 10, z: 2 },
  { x: -6, z: -10 }, { x: 6, z: -10 }, { x: 0, z: -6 },
  { x: -14, z: 10 }, { x: 14, z: 10 }, { x: -4, z: 18 }, { x: 4, z: 18 },
];

export function createLocalSocket() {
  const handlers = new Map();
  const id = 'local_' + Math.random().toString(36).slice(2, 9);
  let room = null;
  let tickInterval = null;
  let droneTimer = null;
  let startTimer = null;

  const api = {
    id,
    connected: true,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return api;
    },
    off(event, fn) {
      if (!handlers.has(event)) return;
      if (!fn) handlers.delete(event);
      else handlers.set(event, handlers.get(event).filter((f) => f !== fn));
    },
    emit(event, data, cb) {
      handle(event, data, typeof data === 'function' ? data : cb);
    },
    disconnect() {
      clearTimers();
      room = null;
      api.connected = false;
      emitLocal('disconnect');
    },
  };

  function emitLocal(event, payload) {
    const list = handlers.get(event) || [];
    for (const fn of list) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  }

  function clearTimers() {
    if (tickInterval) clearInterval(tickInterval);
    if (droneTimer) clearTimeout(droneTimer);
    if (startTimer) clearTimeout(startTimer);
    tickInterval = droneTimer = startTimer = null;
  }

  function beginRoundFlow() {
    clearTimers();
    room.startRound(SPAWNS, CRATE_SPOTS);
    emitLocal('round:drone', room.snapshot());
    startTimer = setTimeout(() => {
      if (room.beginPlaying()) {
        emitLocal('round:start', room.snapshot());
        startTick();
      }
    }, 8000);
  }

  function startTick() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      if (!room || room.state !== 'playing') return;
      for (const p of room.players.values()) {
        if (p.weapon?.reloading) room.finishReload(p.id);
      }
      updateBots(room, emitLocal);
      room.timer = Math.max(0, room.timer - 0.1);
      const winner = room.checkWin();
      if (winner) {
        room.state = 'ended';
        if (winner === 'CT') room.scores.CT++;
        else room.scores.T++;
        clearTimers();
        emitLocal('round:end', { winner, scores: room.scores, snapshot: room.snapshot() });
        return;
      }
      emitLocal('game:tick', {
        timer: room.timer,
        players: room.snapshot().players,
        crates: room.crates,
      });
    }, 100);
  }

  function handle(event, data, cb) {
    if (event === 'room:bot') {
      const code = createRoomCode();
      room = new GameRoom(code, id);
      if (data?.mode === 'solo10') {
        room.setupSolo1v10(id, data.name || 'Player');
      } else {
        room.botMode = true;
        room.addPlayer(id, data?.name || 'Player');
        room.fillBots(10);
        const me = room.players.get(id);
        if (me) me.ready = true;
      }
      cb?.({ ok: true, room: room.snapshot() });
      emitLocal('room:update', room.snapshot());
      droneTimer = setTimeout(beginRoundFlow, 400);
      return;
    }

    if (!room) {
      if (event === 'room:create' || event === 'room:join') {
        cb?.({ ok: false, error: 'Chế độ online cần server Socket.io. Dùng "1 đấu 10 Bot" hoặc "Bot 5v5" trên Vercel.' });
      }
      return;
    }

    if (event === 'round:skipDrone') {
      if (room.state === 'drone' && room.beginPlaying()) {
        if (startTimer) clearTimeout(startTimer);
        emitLocal('round:start', room.snapshot());
        startTick();
      }
      return;
    }

    if (event === 'player:update') {
      room.updatePlayer(id, data || {});
      return;
    }

    if (event === 'player:shoot') {
      const result = room.tryShoot(id, data?.origin, data?.dir, data?.hitPlayerId);
      if (!result) return;
      emitLocal('shot', result);
      if (result.killed) {
        const killer = room.players.get(id);
        const victim = room.players.get(data.hitPlayerId);
        emitLocal('kill', {
          killer: killer?.name,
          victim: victim?.name,
          weaponId: result.weaponId,
        });
      }
      return;
    }

    if (event === 'player:reload') {
      const r = room.reload(id);
      if (r) emitLocal('reload', r);
      return;
    }

    if (event === 'player:switchWeapon') {
      const r = room.switchWeapon(id);
      if (r) emitLocal('weapon:switch', r);
      return;
    }

    if (event === 'player:pickup') {
      const r = room.pickupCrate(id, data?.crateId);
      if (r) emitLocal('crate:picked', r);
      return;
    }

    if (event === 'chat') {
      const p = room.players.get(id);
      emitLocal('chat', { name: p?.name || '???', text: String(data?.text || '').slice(0, 120), system: false });
      return;
    }
  }

  // Fake connect
  setTimeout(() => emitLocal('connect'), 0);
  return api;
}

function updateBots(room, emitLocal) {
  for (const bot of room.players.values()) {
    if (!bot.isBot || !bot.alive) continue;

    if (!bot.weapon) {
      const crate = room.crates.find((c) => {
        if (c.taken) return false;
        const dx = bot.x - c.x;
        const dz = bot.z - c.z;
        return dx * dx + dz * dz < 16;
      });
      if (crate) {
        const dx = crate.x - bot.x;
        const dz = crate.z - bot.z;
        const dist = Math.hypot(dx, dz) || 1;
        if (dist > 1.2) {
          bot.x += (dx / dist) * 0.12;
          bot.z += (dz / dist) * 0.12;
          bot.yaw = Math.atan2(dx, dz);
        } else {
          const r = room.pickupCrate(bot.id, crate.id);
          if (r) emitLocal('crate:picked', r);
        }
        continue;
      }
      const target = room.crates.find((c) => !c.taken) || { x: 0, z: 0 };
      const dx = target.x - bot.x;
      const dz = target.z - bot.z;
      const dist = Math.hypot(dx, dz) || 1;
      bot.x += (dx / dist) * 0.1;
      bot.z += (dz / dist) * 0.1;
      bot.yaw = Math.atan2(dx, dz);
      continue;
    }

    let nearest = null;
    let nearestDist = Infinity;
    for (const other of room.players.values()) {
      if (!other.alive || other.team === bot.team) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = other;
      }
    }
    if (!nearest) continue;

    const dx = nearest.x - bot.x;
    const dz = nearest.z - bot.z;
    bot.yaw = Math.atan2(dx, dz);

    if (nearestDist > 12) {
      bot.x += (dx / nearestDist) * 0.11;
      bot.z += (dz / nearestDist) * 0.11;
    } else if (nearestDist < 4) {
      bot.x -= (dx / nearestDist) * 0.08;
      bot.z -= (dz / nearestDist) * 0.08;
    }

    bot.x = Math.max(-22, Math.min(22, bot.x));
    bot.z = Math.max(-26, Math.min(26, bot.z));

    if (nearestDist < 35 && bot.weapon.clip > 0) {
      const dir = { x: Math.sin(bot.yaw), y: 0, z: Math.cos(bot.yaw) };
      const origin = { x: bot.x, y: 1.5, z: bot.z };
      const hitChance = Math.max(0.15, 1 - nearestDist / 40);
      const hitId = Math.random() < hitChance ? nearest.id : null;
      const result = room.tryShoot(bot.id, origin, dir, hitId);
      if (result) {
        emitLocal('shot', result);
        if (result.killed) {
          emitLocal('kill', {
            killer: bot.name,
            victim: nearest.name,
            weaponId: result.weaponId,
          });
        }
      }
    } else if (bot.weapon.clip <= 0) {
      room.reload(bot.id);
    }
  }
}
