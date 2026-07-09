function updateBotsMeleeOrGun(room, onShot, onKill, onCrate) {
  for (const bot of room.players.values()) {
    if (!bot.isBot || !bot.alive) continue;

    const isFist = bot.weapon?.id === 'FIST' || (room.soloMode && !bot.weapon);
    // Ensure solo bots keep fists
    if (room.soloMode && (!bot.weapon || bot.weapon.id !== 'FIST')) {
      room.giveLoadout(bot, ['FIST']);
    }

    // Non-solo unarmed bots may still seek crates
    if (!bot.weapon && !room.soloMode) {
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
          if (r) onCrate?.(r);
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

    const engageDist = isFist ? 2.2 : 12;
    const retreatDist = isFist ? 1.2 : 4;
    const speed = isFist ? 0.14 : 0.11;

    if (nearestDist > engageDist) {
      bot.x += (dx / nearestDist) * speed;
      bot.z += (dz / nearestDist) * speed;
    } else if (!isFist && nearestDist < retreatDist) {
      bot.x -= (dx / nearestDist) * 0.08;
      bot.z -= (dz / nearestDist) * 0.08;
    }

    bot.x = Math.max(-22, Math.min(22, bot.x));
    bot.z = Math.max(-26, Math.min(26, bot.z));

    if (isFist) {
      // Punch only in melee range — 10 hits to kill
      if (nearestDist <= 2.6) {
        const origin = { x: bot.x, y: 1.2, z: bot.z };
        const dir = { x: Math.sin(bot.yaw), y: 0, z: Math.cos(bot.yaw) };
        const result = room.tryShoot(bot.id, origin, dir, nearest.id);
        if (result) {
          onShot?.(result);
          if (result.killed) {
            onKill?.({ killer: bot.name, victim: nearest.name, weaponId: 'FIST' });
          }
        }
      }
    } else if (nearestDist < 35 && bot.weapon.clip > 0) {
      const dir = { x: Math.sin(bot.yaw), y: 0, z: Math.cos(bot.yaw) };
      const origin = { x: bot.x, y: 1.5, z: bot.z };
      const hitChance = Math.max(0.15, 1 - nearestDist / 40);
      const hitId = Math.random() < hitChance ? nearest.id : null;
      const result = room.tryShoot(bot.id, origin, dir, hitId);
      if (result) {
        onShot?.(result);
        if (result.killed) {
          onKill?.({ killer: bot.name, victim: nearest.name, weaponId: result.weaponId });
        }
      }
    } else if (bot.weapon.clip <= 0) {
      room.reload(bot.id);
    }
  }
}

export { updateBotsMeleeOrGun };
