import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom, createRoomCode, WEAPONS } from '../js/room.js';
import { updateBotsMeleeOrGun } from '../js/botAI.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(express.static(root));
app.use('/node_modules', express.static(path.join(root, 'node_modules')));

const rooms = new Map();
const DRONE_MS = 5300; // ~50% faster than 8s

// Shared spawn / crate data (must match client map)
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

function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

function broadcastRoom(room) {
  io.to(room.code).emit('room:update', room.snapshot());
}

function endRound(room, winner) {
  room.state = 'ended';
  if (winner === 'CT') room.scores.CT++;
  else room.scores.T++;
  io.to(room.code).emit('round:end', {
    winner,
    scores: room.scores,
    snapshot: room.snapshot(),
  });
  if (room.tickInterval) {
    clearInterval(room.tickInterval);
    room.tickInterval = null;
  }
}

function startTick(room) {
  if (room.tickInterval) clearInterval(room.tickInterval);
  room.tickInterval = setInterval(() => {
    if (room.state !== 'playing') return;

    // Finish reloads
    for (const p of room.players.values()) {
      if (p.weapon?.reloading) room.finishReload(p.id);
    }

    // Bot AI (after shared countdown so both sides enter together)
    if (!room.combatAt || Date.now() >= room.combatAt) {
      updateBotsMeleeOrGun(
        room,
        (r) => io.to(room.code).emit('shot', r),
        (k) => io.to(room.code).emit('kill', k),
        (c) => io.to(room.code).emit('crate:picked', c),
      );
    }

    room.timer = Math.max(0, room.timer - 0.1);
    const winner = room.checkWin();
    if (winner) {
      endRound(room, winner);
      return;
    }

    io.to(room.code).emit('game:tick', {
      timer: room.timer,
      players: room.snapshot().players,
      crates: room.crates,
    });
  }, 100);
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  socket.on('room:create', ({ name }, cb) => {
    let code = createRoomCode();
    while (rooms.has(code)) code = createRoomCode();
    const room = new GameRoom(code, socket.id);
    room.addPlayer(socket.id, name);
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    cb?.({ ok: true, room: room.snapshot() });
    broadcastRoom(room);
  });

  socket.on('room:join', ({ code, name }, cb) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: 'Không tìm thấy phòng' });
    if (room.state !== 'lobby') return cb?.({ ok: false, error: 'Trận đã bắt đầu' });
    const p = room.addPlayer(socket.id, name);
    if (!p) return cb?.({ ok: false, error: 'Phòng đầy' });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    cb?.({ ok: true, room: room.snapshot() });
    broadcastRoom(room);
    io.to(room.code).emit('chat', { system: true, text: `${p.name} đã vào phòng` });
  });

  socket.on('room:bot', ({ name, mode }, cb) => {
    let code = createRoomCode();
    while (rooms.has(code)) code = createRoomCode();
    const room = new GameRoom(code, socket.id);

    if (mode === 'solo10') {
      room.setupSolo1v10(socket.id, name);
    } else {
      room.botMode = true;
      room.addPlayer(socket.id, name);
      room.fillBots(10);
      const me = room.players.get(socket.id);
      if (me) me.ready = true;
    }

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    cb?.({ ok: true, room: room.snapshot() });
    broadcastRoom(room);
    setTimeout(() => {
      room.startRound(SPAWNS, CRATE_SPOTS);
      io.to(room.code).emit('round:drone', room.snapshot());
      setTimeout(() => {
        if (room.beginPlaying()) {
          room.combatAt = Date.now() + 2100;
          io.to(room.code).emit('round:start', room.snapshot());
          startTick(room);
        }
      }, DRONE_MS);
    }, 500);
  });

  socket.on('room:team', ({ team }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    if (room.setTeam(socket.id, team)) broadcastRoom(room);
  });

  socket.on('room:ready', ({ ready }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    room.setReady(socket.id, ready);
    broadcastRoom(room);
  });

  socket.on('room:fillBots', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    room.fillBots();
    broadcastRoom(room);
  });

  socket.on('room:start', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (!room.canStart()) {
      // auto-fill bots if needed for demo
      if ([...room.players.values()].filter((p) => p.ready || p.isBot).length >= 1) {
        if ([...room.players.values()].filter((p) => p.team === 'CT').length === 0 ||
            [...room.players.values()].filter((p) => p.team === 'T').length === 0) {
          room.fillBots();
        }
      } else {
        return;
      }
    }
    // Mark all ready
    for (const p of room.players.values()) p.ready = true;
    room.startRound(SPAWNS, CRATE_SPOTS);
    io.to(room.code).emit('round:drone', room.snapshot());
    setTimeout(() => {
      if (room.beginPlaying()) {
        room.combatAt = Date.now() + 2100;
        io.to(room.code).emit('round:start', room.snapshot());
        startTick(room);
      }
    }, DRONE_MS);
  });

  socket.on('chat', ({ text }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !text) return;
    const p = room.players.get(socket.id);
    const msg = { name: p?.name || '???', text: String(text).slice(0, 120), system: false };
    io.to(room.code).emit('chat', msg);
  });

  socket.on('player:update', (data) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    room.updatePlayer(socket.id, data);
  });

  socket.on('player:shoot', ({ origin, dir, hitPlayerId }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    if (room.combatAt && Date.now() < room.combatAt) return;
    const result = room.tryShoot(socket.id, origin, dir, hitPlayerId);
    if (!result) return;
    io.to(room.code).emit('shot', result);
    if (result.killed) {
      const killer = room.players.get(socket.id);
      const victim = room.players.get(hitPlayerId);
      io.to(room.code).emit('kill', {
        killer: killer?.name,
        victim: victim?.name,
        weaponId: result.weaponId,
      });
    }
  });

  socket.on('player:reload', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const r = room.reload(socket.id);
    if (r) io.to(room.code).emit('reload', r);
  });

  socket.on('player:switchWeapon', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const r = room.switchWeapon(socket.id);
    if (r) io.to(room.code).emit('weapon:switch', r);
  });

  socket.on('player:pickup', ({ crateId }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const r = room.pickupCrate(socket.id, crateId);
    if (r) io.to(room.code).emit('crate:picked', r);
  });

  socket.on('round:skipDrone', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.state !== 'drone') return;
    if (room.beginPlaying()) {
      room.combatAt = Date.now() + 2100;
      io.to(room.code).emit('round:start', room.snapshot());
      startTick(room);
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const p = room.players.get(socket.id);
    room.removePlayer(socket.id);
    socket.leave(code);
    if (room.players.size === 0 || [...room.players.values()].every((x) => x.isBot)) {
      if (room.tickInterval) clearInterval(room.tickInterval);
      rooms.delete(code);
    } else {
      io.to(code).emit('chat', { system: true, text: `${p?.name || 'Player'} đã rời` });
      broadcastRoom(room);
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;

function tryListen(port, attemptsLeft = 10) {
  const onError = (err) => {
    httpServer.off('listening', onListening);
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} đang bận — thử port ${port + 1}...`);
      // Must close before re-listen on some Node versions
      httpServer.close(() => tryListen(port + 1, attemptsLeft - 1));
      return;
    }
    console.error('Không khởi động được server:', err.message);
    process.exit(1);
  };
  const onListening = () => {
    httpServer.off('error', onError);
    console.log(`Block Tactical 5v5 → http://localhost:${port}`);
    console.log('Mở link trên bằng trình duyệt (không mở file index.html trực tiếp).');
  };
  httpServer.once('error', onError);
  httpServer.once('listening', onListening);
  httpServer.listen(port);
}

tryListen(PORT);
