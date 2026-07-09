import { WEAPONS, randomWeaponId, createWeaponState } from './weapons.js';

const ROUND_TIME = 300; // 5 minutes
const MAX_PER_TEAM = 5;

export function createRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export class GameRoom {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map();
    this.state = 'lobby'; // lobby | countdown | drone | playing | ended
    this.roundTime = ROUND_TIME;
    this.timer = ROUND_TIME;
    this.scores = { CT: 0, T: 0 };
    this.crates = [];
    this.chat = [];
    this.tickInterval = null;
    this.botMode = false;
  }

  addPlayer(id, name, isBot = false) {
    if (this.players.size >= 10 && !this.players.has(id)) return null;
    const ctCount = [...this.players.values()].filter((p) => p.team === 'CT').length;
    const tCount = [...this.players.values()].filter((p) => p.team === 'T').length;
    const team = ctCount <= tCount ? 'CT' : 'T';
    if ((team === 'CT' && ctCount >= MAX_PER_TEAM) || (team === 'T' && tCount >= MAX_PER_TEAM)) {
      // force other team if possible
      const other = team === 'CT' ? 'T' : 'CT';
      const otherCount = other === 'CT' ? ctCount : tCount;
      if (otherCount >= MAX_PER_TEAM) return null;
    }
    const finalTeam = ctCount <= tCount ? (ctCount < MAX_PER_TEAM ? 'CT' : 'T') : (tCount < MAX_PER_TEAM ? 'T' : 'CT');
    const p = {
      id,
      name: name || `Player${id.slice(0, 4)}`,
      team: finalTeam,
      ready: isBot,
      isBot,
      hp: 100,
      alive: true,
      x: 0, y: 0, z: 0,
      yaw: 0, pitch: 0,
      weapon: null,
      kills: 0,
      deaths: 0,
      prone: false,
      ads: false,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.hostId === id) {
      const next = [...this.players.values()].find((p) => !p.isBot);
      this.hostId = next?.id || null;
    }
  }

  setTeam(id, team) {
    const p = this.players.get(id);
    if (!p || this.state !== 'lobby') return false;
    const count = [...this.players.values()].filter((x) => x.team === team && x.id !== id).length;
    if (count >= MAX_PER_TEAM) return false;
    p.team = team;
    return true;
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (p) p.ready = ready;
  }

  fillBots() {
    let n = 0;
    while (this.players.size < 10) {
      const id = `bot_${this.code}_${n++}_${Math.random().toString(36).slice(2, 6)}`;
      this.addPlayer(id, `Bot ${n}`, true);
    }
  }

  canStart() {
    const humans = [...this.players.values()].filter((p) => !p.isBot);
    if (!humans.length) return false;
    const allReady = humans.every((p) => p.ready);
    const ct = [...this.players.values()].filter((p) => p.team === 'CT').length;
    const t = [...this.players.values()].filter((p) => p.team === 'T').length;
    return allReady && ct >= 1 && t >= 1;
  }

  spawnCrates(spots) {
    this.crates = spots.map((s, i) => ({
      id: `crate_${i}`,
      x: s.x,
      z: s.z,
      y: 0,
      weaponId: randomWeaponId(),
      taken: false,
    }));
  }

  startRound(spawns, crateSpots) {
    this.state = 'drone';
    this.timer = ROUND_TIME;
    this.spawnCrates(crateSpots);

    const byTeam = { CT: 0, T: 0 };
    for (const p of this.players.values()) {
      p.hp = 100;
      p.alive = true;
      p.weapon = null;
      p.prone = false;
      p.ads = false;
      const list = spawns[p.team] || spawns.CT;
      const idx = byTeam[p.team] % list.length;
      byTeam[p.team]++;
      const s = list[idx];
      p.x = s.x;
      p.y = 0;
      p.z = s.z;
      p.yaw = p.team === 'CT' ? Math.PI : 0;
      p.pitch = 0;
    }
  }

  beginPlaying() {
    if (this.state === 'playing') return false;
    this.state = 'playing';
    return true;
  }

  pickupCrate(playerId, crateId) {
    const p = this.players.get(playerId);
    const crate = this.crates.find((c) => c.id === crateId);
    if (!p || !p.alive || !crate || crate.taken) return null;
    const dx = p.x - crate.x;
    const dz = p.z - crate.z;
    if (dx * dx + dz * dz > 4) return null;
    crate.taken = true;
    p.weapon = createWeaponState(crate.weaponId);
    return { playerId, crateId, weaponId: crate.weaponId };
  }

  tryShoot(playerId, origin, dir, hitPlayerId) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.state !== 'playing') return null;
    if (!p.weapon) return null;
    const w = WEAPONS[p.weapon.id];
    if (!w) return null;
    const now = Date.now() / 1000;
    if (p.weapon.reloading) return null;
    if (now - p.weapon.lastShot < w.fireRate) return null;
    if (p.weapon.clip <= 0) return null;

    p.weapon.clip--;
    p.weapon.lastShot = now;

    const result = {
      shooterId: playerId,
      weaponId: p.weapon.id,
      origin,
      dir,
      hit: null,
      killed: false,
    };

    if (hitPlayerId) {
      const target = this.players.get(hitPlayerId);
      if (target && target.alive && target.team !== p.team) {
        let dmg = w.damage;
        if (w.pellets) dmg = w.damage * 3; // shotgun average
        target.hp -= dmg;
        result.hit = { id: hitPlayerId, damage: dmg, hp: Math.max(0, target.hp) };
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          target.deaths++;
          p.kills++;
          result.killed = true;
        }
      }
    }
    return result;
  }

  reload(playerId) {
    const p = this.players.get(playerId);
    if (!p?.weapon || p.weapon.reloading) return null;
    const w = WEAPONS[p.weapon.id];
    if (p.weapon.clip >= w.clipSize || p.weapon.reserve <= 0) return null;
    p.weapon.reloading = true;
    p.weapon.reloadEnd = Date.now() / 1000 + w.reloadTime;
    return { playerId, duration: w.reloadTime };
  }

  finishReload(playerId) {
    const p = this.players.get(playerId);
    if (!p?.weapon || !p.weapon.reloading) return;
    if (Date.now() / 1000 < p.weapon.reloadEnd) return;
    const w = WEAPONS[p.weapon.id];
    const need = w.clipSize - p.weapon.clip;
    const take = Math.min(need, p.weapon.reserve);
    p.weapon.clip += take;
    p.weapon.reserve -= take;
    p.weapon.reloading = false;
  }

  updatePlayer(id, data) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (data.x != null) p.x = data.x;
    if (data.y != null) p.y = data.y;
    if (data.z != null) p.z = data.z;
    if (data.yaw != null) p.yaw = data.yaw;
    if (data.pitch != null) p.pitch = data.pitch;
    if (data.prone != null) p.prone = data.prone;
    if (data.ads != null) p.ads = data.ads;
  }

  checkWin() {
    const ctAlive = [...this.players.values()].filter((p) => p.team === 'CT' && p.alive).length;
    const tAlive = [...this.players.values()].filter((p) => p.team === 'T' && p.alive).length;
    if (tAlive === 0) return 'CT';
    if (ctAlive === 0) return 'T';
    if (this.timer <= 0) return 'CT'; // CT wins on time (defend)
    return null;
  }

  snapshot() {
    return {
      code: this.code,
      state: this.state,
      timer: this.timer,
      scores: this.scores,
      hostId: this.hostId,
      crates: this.crates,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        ready: p.ready,
        isBot: p.isBot,
        hp: p.hp,
        alive: p.alive,
        x: p.x, y: p.y, z: p.z,
        yaw: p.yaw, pitch: p.pitch,
        weapon: p.weapon,
        kills: p.kills,
        deaths: p.deaths,
        prone: p.prone,
        ads: p.ads,
      })),
    };
  }
}

export { ROUND_TIME, MAX_PER_TEAM, WEAPONS };
