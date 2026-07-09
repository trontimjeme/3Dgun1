import { WEAPONS, randomWeaponId, createWeaponState } from './weapons.js';

const ROUND_TIME = 300; // 5 minutes
const MAX_PER_TEAM = 5;

export function createRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function emptyLoadout() {
  return { slots: [], active: 0 };
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
    this.soloMode = false; // 1 human vs N bots
    this.maxPlayers = 10;
  }

  addPlayer(id, name, isBot = false, forceTeam = null) {
    if (this.players.size >= this.maxPlayers && !this.players.has(id)) return null;

    let finalTeam = forceTeam;
    if (!finalTeam) {
      if (this.soloMode) {
        finalTeam = isBot ? 'T' : 'CT';
      } else {
        const ctCount = [...this.players.values()].filter((p) => p.team === 'CT').length;
        const tCount = [...this.players.values()].filter((p) => p.team === 'T').length;
        finalTeam = ctCount <= tCount
          ? (ctCount < MAX_PER_TEAM ? 'CT' : 'T')
          : (tCount < MAX_PER_TEAM ? 'T' : 'CT');
        const count = [...this.players.values()].filter((p) => p.team === finalTeam).length;
        if (!this.soloMode && count >= MAX_PER_TEAM) return null;
      }
    }

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
      loadout: emptyLoadout(),
      weapon: null,
      kills: 0,
      deaths: 0,
      prone: false,
      ads: false,
      sprinting: false,
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
    if (!p || this.state !== 'lobby' || this.soloMode) return false;
    const count = [...this.players.values()].filter((x) => x.team === team && x.id !== id).length;
    if (count >= MAX_PER_TEAM) return false;
    p.team = team;
    return true;
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (p) p.ready = ready;
  }

  fillBots(targetTotal = 10) {
    let n = [...this.players.values()].filter((p) => p.isBot).length;
    while (this.players.size < targetTotal) {
      n++;
      const id = `bot_${this.code}_${n}_${Math.random().toString(36).slice(2, 6)}`;
      const team = this.soloMode ? 'T' : null;
      this.addPlayer(id, `Bot ${n}`, true, team);
    }
  }

  /** 1 human CT vs 10 Terrorist bots */
  setupSolo1v10(humanId, humanName) {
    this.soloMode = true;
    this.botMode = true;
    this.maxPlayers = 11;
    this.addPlayer(humanId, humanName, false, 'CT');
    this.fillBots(11);
    const me = this.players.get(humanId);
    if (me) me.ready = true;
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

  giveLoadout(p, weaponIds) {
    p.loadout = {
      slots: weaponIds.map((id) => createWeaponState(id)),
      active: 0,
    };
    p.weapon = p.loadout.slots[0];
  }

  startRound(spawns, crateSpots) {
    this.state = 'lobby'; // beginPlaying() will set 'playing' — never leave clients in drone/spectator
    this.timer = ROUND_TIME;
    this.spawnCrates(crateSpots);

    const byTeam = { CT: 0, T: 0 };
    for (const p of this.players.values()) {
      p.hp = 100;
      p.alive = true;
      p.prone = false;
      p.ads = false;
      p.sprinting = false;
      p.loadout = emptyLoadout();
      p.weapon = null;

      // Solo human: AWP + AK47 · Solo bots: tay không (10 đấm mới chết)
      if (this.soloMode && !p.isBot) {
        this.giveLoadout(p, ['AWP', 'AK47']);
      } else if (this.soloMode && p.isBot) {
        this.giveLoadout(p, ['FIST']);
      }

      const list = spawns[p.team] || spawns.CT;
      const idx = byTeam[p.team] % list.length;
      byTeam[p.team]++;
      const s = list[idx];
      // Solo: cả hai bên spawn cùng lúc gần sân giữa (không lệch map)
      if (this.soloMode && p.isBot) {
        const angle = (byTeam.T / 10) * Math.PI * 2;
        p.x = Math.cos(angle) * (8 + Math.random() * 4);
        p.z = Math.sin(angle) * (8 + Math.random() * 4);
        p.yaw = Math.atan2(-p.x, -p.z);
      } else if (this.soloMode && !p.isBot) {
        p.x = 0;
        p.y = 0;
        p.z = 14;
        p.yaw = Math.PI;
      } else {
        p.x = s.x;
        p.y = 0;
        p.z = s.z;
        p.yaw = p.team === 'CT' ? Math.PI : 0;
      }
      p.y = 0;
      p.pitch = 0;
    }
  }

  beginPlaying() {
    if (this.state === 'playing') return false;
    this.state = 'playing';
    return true;
  }

  switchWeapon(playerId) {
    const p = this.players.get(playerId);
    if (!p?.alive || !p.loadout?.slots?.length) return null;
    if (p.loadout.slots.length < 2) return null;
    // Save current weapon state back into slot
    if (p.weapon) p.loadout.slots[p.loadout.active] = p.weapon;
    p.loadout.active = (p.loadout.active + 1) % p.loadout.slots.length;
    p.weapon = p.loadout.slots[p.loadout.active];
    if (p.weapon) p.weapon.reloading = false;
    return { playerId, weaponId: p.weapon?.id, active: p.loadout.active };
  }

  tryShoot(playerId, origin, dir, hitPlayerId) {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.state !== 'playing') return null;
    if (!p.weapon) return null;
    const w = WEAPONS[p.weapon.id];
    if (!w) return null;
    const now = Date.now() / 1000;
    if (p.weapon.reloading) return null;
    if (now - (p.weapon.lastShot || 0) < w.fireRate) return null;
    const isMelee = !!w.melee;
    if (!isMelee && p.weapon.clip <= 0) return null;

    // Server-side hit scan when client raycast misses (common in 1v10)
    if (!hitPlayerId && origin && dir && !isMelee) {
      hitPlayerId = this._raycastHitPlayer(p, origin, dir, w.range);
    }

    if (!isMelee) p.weapon.clip--;
    p.weapon.lastShot = now;

    const result = {
      shooterId: playerId,
      weaponId: p.weapon.id,
      origin,
      dir,
      hit: null,
      killed: false,
      melee: isMelee,
    };

    if (hitPlayerId) {
      const target = this.players.get(hitPlayerId);
      if (target && target.alive && target.team !== p.team) {
        // Melee: must be in range
        if (isMelee) {
          const dx = (origin?.x ?? p.x) - target.x;
          const dz = (origin?.z ?? p.z) - target.z;
          if (dx * dx + dz * dz > w.range * w.range) return result;
        }
        let dmg = w.damage;
        if (w.pellets) dmg = w.damage * 3;
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

  /** Ray vs player capsule — forgiving hit for bots */
  _raycastHitPlayer(shooter, origin, dir, maxRange) {
    const ox = origin.x ?? shooter.x;
    const oy = origin.y ?? shooter.y + 1.5;
    const oz = origin.z ?? shooter.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ndx = dx / len;
    const ndy = dy / len;
    const ndz = dz / len;

    let bestId = null;
    let bestT = maxRange;
    const hitR = 1.35;

    for (const target of this.players.values()) {
      if (target.id === shooter.id || target.team === shooter.team || !target.alive) continue;
      const tx = target.x;
      const ty = target.y + 1.0;
      const tz = target.z;
      const t = (tx - ox) * ndx + (ty - oy) * ndy + (tz - oz) * ndz;
      if (t < 0.2 || t > bestT) continue;
      const cx = ox + ndx * t;
      const cy = oy + ndy * t;
      const cz = oz + ndz * t;
      const dist = Math.hypot(tx - cx, ty - cy, tz - cz);
      if (dist <= hitR) {
        bestT = t;
        bestId = target.id;
      }
    }
    return bestId;
  }

  /** Solo bots never pick up guns — stay fists-only */
  pickupCrate(playerId, crateId) {
    const p = this.players.get(playerId);
    if (this.soloMode && p?.isBot) return null;
    return this._pickupCrateInner(playerId, crateId);
  }

  _pickupCrateInner(playerId, crateId) {
    const p = this.players.get(playerId);
    const crate = this.crates.find((c) => c.id === crateId);
    if (!p || !p.alive || !crate || crate.taken) return null;
    const dx = p.x - crate.x;
    const dz = p.z - crate.z;
    if (dx * dx + dz * dz > 4) return null;
    crate.taken = true;
    const state = createWeaponState(crate.weaponId);
    if (!p.loadout) p.loadout = emptyLoadout();
    if (p.loadout.slots.length < 2) {
      p.loadout.slots.push(state);
      p.loadout.active = p.loadout.slots.length - 1;
    } else {
      p.loadout.slots[p.loadout.active] = state;
    }
    p.weapon = p.loadout.slots[p.loadout.active];
    return { playerId, crateId, weaponId: crate.weaponId, loadout: p.loadout };
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
    if (data.sprinting != null) p.sprinting = data.sprinting;
  }

  checkWin() {
    const ctAlive = [...this.players.values()].filter((p) => p.team === 'CT' && p.alive).length;
    const tAlive = [...this.players.values()].filter((p) => p.team === 'T' && p.alive).length;
    if (tAlive === 0) return 'CT';
    if (ctAlive === 0) return 'T';
    if (this.timer <= 0) return 'CT';
    return null;
  }

  snapshot() {
    return {
      code: this.code,
      state: this.state,
      timer: this.timer,
      scores: this.scores,
      hostId: this.hostId,
      soloMode: this.soloMode,
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
        loadout: p.loadout,
        kills: p.kills,
        deaths: p.deaths,
        prone: p.prone,
        ads: p.ads,
        sprinting: p.sprinting,
      })),
    };
  }
}

export { ROUND_TIME, MAX_PER_TEAM, WEAPONS };
