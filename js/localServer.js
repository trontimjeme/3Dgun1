/**
 * Offline / Vercel-friendly local game host.
 * Mimics the Socket.io room API so bot modes work without a Node server.
 */
import { GameRoom, createRoomCode } from './room.js';
import { updateBotsMeleeOrGun } from './botAI.js';

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

  function startTick() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      if (!room || room.state !== 'playing') return;
      for (const p of room.players.values()) {
        if (p.weapon?.reloading) room.finishReload(p.id);
      }
      // Both sides wait for countdown before combat
      if (!room.combatAt || Date.now() >= room.combatAt) {
        updateBotsMeleeOrGun(
          room,
          (r) => emitLocal('shot', r),
          (k) => emitLocal('kill', k),
          (c) => emitLocal('crate:picked', c),
        );
      }
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
        state: room.state,
      });
    }, 100);
  }

  /** Start match immediately and return a playable snapshot (spawns + weapons). */
  function startMatchNow() {
    clearTimers();
    room.startRound(SPAWNS, CRATE_SPOTS);
    room.beginPlaying();
    room.combatAt = Date.now() + 2100;
    startTick();
    return room.snapshot();
  }

  function handle(event, data, cb) {
    if (event === 'room:bot') {
      clearTimers();
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
      // Critical: start round BEFORE ack so client can enter FPS in the same click handler
      const snap = startMatchNow();
      emitLocal('round:start', snap);
      cb?.({ ok: true, room: snap });
      return;
    }

    if (!room) {
      if (event === 'room:create' || event === 'room:join') {
        cb?.({ ok: false, error: 'Chế độ online cần server Socket.io. Dùng "1 đấu 10 Bot" hoặc "Bot 5v5" trên Vercel.' });
      }
      return;
    }

    if (event === 'round:skipDrone') {
      // No-op: drone disabled — already in FPS
      return;
    }

    if (event === 'player:update') {
      room.updatePlayer(id, data || {});
      return;
    }

    if (event === 'player:shoot') {
      // Freeze combat until countdown ends (both sides enter together)
      if (room.combatAt && Date.now() < room.combatAt) return;
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
