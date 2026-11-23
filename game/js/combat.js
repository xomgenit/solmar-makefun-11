// SOLMAR combat: mouse-aim hitscan with three weapon slots, enemy squads,
// player health with slow regen after 8 calm seconds, and the wasted/busted
// end states. All three weapons share one hitscan + tracer path and differ
// only in their params.

import { dist, segmentHitsRects } from './util.js';
import { knockDownPed } from './people.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 25, rate: 0.28, spread: 0.03, pellets: 1, range: 700 },
  smg: { name: 'SMG', damage: 12, rate: 0.09, spread: 0.09, pellets: 1, range: 620 },
  shotgun: { name: 'Shotgun', damage: 10, rate: 0.7, spread: 0.22, pellets: 5, range: 480 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun'];

export function hasLineOfSight(game, x1, y1, x2, y2) {
  return !segmentHitsRects(x1, y1, x2, y2, game.city.buildings);
}

let nextEnemyId = 1;

/** Spawn an enemy: a Harbor King gang member or a cop shooter. */
export function spawnEnemy(game, x, y, kind = 'king') {
  const enemy = {
    id: nextEnemyId++,
    kind,
    x,
    y,
    hp: kind === 'king' ? 80 : 60,
    maxHp: kind === 'king' ? 80 : 60,
    angle: 0,
    holdX: x,
    holdY: y,
    shootCd: 0.5 + Math.random(),
    dead: false,
  };
  game.enemies.push(enemy);
  return enemy;
}

export function damagePlayer(game, amount, source) {
  if (game.state !== 'playing') return;
  game.player.hp = Math.max(0, game.player.hp - amount);
  game.player.lastHurtAt = game.time;
  game.effects.addShake(2);
  if (game.player.hp <= 0) game.wasted(source);
}

/** Raycast one hitscan pellet from (x, y) along angle. Returns the hit point. */
function firePellet(game, x, y, angle, weapon) {
  const range = weapon.range;
  const ex = x + Math.cos(angle) * range;
  const ey = y + Math.sin(angle) * range;
  // Nearest target along the ray: enemies, cops, peds, cars (not the player's own).
  let best = null;
  let bestT = Infinity;
  const consider = (tx, ty, radius, target) => {
    const dx = tx - x;
    const dy = ty - y;
    const t = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (t <= 0 || t >= range || t >= bestT) return;
    const px = x + Math.cos(angle) * t;
    const py = y + Math.sin(angle) * t;
    if (dist(px, py, tx, ty) > radius) return;
    best = { tx, ty, t, target };
    bestT = t;
  };
  for (const e of game.enemies) if (!e.dead) consider(e.x, e.y, 16, { type: 'enemy', ref: e });
  for (const c of game.cops) consider(c.x, c.y, 15, { type: 'cop', ref: c });
  for (const p of game.peds) if (!p.down) consider(p.x, p.y, 13, { type: 'ped', ref: p });
  for (const car of game.cars) {
    if (car === game.player.car) continue;
    consider(car.x, car.y, 24, { type: 'car', ref: car });
  }
  // A building between muzzle and target eats the bullet.
  if (best && segmentHitsRects(x, y, best.tx, best.ty, game.city.buildings)) {
    best = null;
  }
  const hx = best ? best.tx : ex;
  const hy = best ? best.ty : ey;
  game.effects.tracer(x, y, hx, hy);
  if (!best) return { x: hx, y: hy, hit: null };
  const target = best.target;
  if (target.type === 'enemy') {
    target.ref.hp -= weapon.damage;
    game.effects.blood(target.ref.x, target.ref.y);
    if (target.ref.hp <= 0 && !target.ref.dead) killEnemy(game, target.ref);
  } else if (target.type === 'cop') {
    target.ref.hp -= weapon.damage;
    game.effects.blood(target.ref.x, target.ref.y);
    if (target.ref.hp <= 0) killCop(game, target.ref);
  } else if (target.type === 'ped') {
    game.effects.blood(target.ref.x, target.ref.y);
    knockDownPed(game, target.ref, true);
  } else if (target.type === 'car') {
    target.ref.hp = Math.max(0, target.ref.hp - weapon.damage);
    game.effects.sparks(target.ref.x, target.ref.y);
  }
  return { x: hx, y: hy, hit: target };
}

function killEnemy(game, enemy) {
  enemy.dead = true;
  game.effects.burst(enemy.x, enemy.y, '#c0392b', 14, 180);
  if (enemy.kind === 'cop') {
    game.police.addWanted(1);
  } else if (game.missions) {
    game.missions.onEnemyDown(enemy);
  }
}

function killCop(game, cop) {
  const i = game.cops.indexOf(cop);
  if (i >= 0) game.cops.splice(i, 1);
  game.effects.burst(cop.x, cop.y, '#c0392b', 14, 180);
  game.police.addWanted(1);
}

/** The player's shot, from the player toward the mouse world position. */
export function shoot(game) {
  const player = game.player;
  const weapon = WEAPONS[player.weapon];
  if (game.time - player.lastShotAt < weapon.rate) return;
  player.lastShotAt = game.time;
  const mx = game.input.mouseWorld.x;
  const my = game.input.mouseWorld.y;
  const base = Math.atan2(my - player.y, mx - player.x);
  player.angle = base;
  for (let i = 0; i < weapon.pellets; i++) {
    const a = base + (Math.random() - 0.5) * 2 * weapon.spread;
    firePellet(game, player.x, player.y, a, weapon);
  }
  game.effects.muzzle(player.x, player.y, base);
  game.sfx('shoot');
  game.effects.addShake(weapon.pellets > 1 ? 2 : 1);
  // Gunfire scares nearby peds.
  for (const ped of game.peds) {
    if (dist(ped.x, ped.y, player.x, player.y) < 420) ped.flee = 4;
  }
}

/** Enemies hold their ground and shoot the player within 380px, with LOS. */
export function updateEnemies(game, dt) {
  const px = game.player.x;
  const py = game.player.y;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, px, py);
    e.angle = Math.atan2(py - e.y, px - e.x);
    // Drift back to the held position when the player is far.
    const hd = dist(e.x, e.y, e.holdX, e.holdY);
    if (d > 420 && hd > 30) {
      const a = Math.atan2(e.holdY - e.y, e.holdX - e.x);
      e.x += Math.cos(a) * 90 * dt;
      e.y += Math.sin(a) * 90 * dt;
    }
    e.shootCd -= dt;
    if (d < 380 && e.shootCd <= 0 && hasLineOfSight(game, e.x, e.y, px, py)) {
      e.shootCd = 0.8 + Math.random() * 0.6;
      game.effects.tracer(e.x, e.y, px, py);
      game.effects.muzzle(e.x, e.y, e.angle);
      game.sfx('shoot');
      if (Math.random() < 0.5) damagePlayer(game, e.damage || (e.kind === 'king' ? 8 : 6), e.kind);
    }
  }
  game.enemies = game.enemies.filter((e) => !e.dead);
}

/** Slow health regen after 8 calm seconds. */
export function updatePlayerHealth(game, dt) {
  const player = game.player;
  const maxHp = player.maxHp || 100;
  if (player.hp > 0 && player.hp < maxHp && game.time - player.lastHurtAt > 8) {
    player.hp = Math.min(maxHp, player.hp + 4 * dt);
  }
}
