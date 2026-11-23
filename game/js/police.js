// SOLMAR police: the wanted system (0-5 stars) and the response to it.
// Foot cops chase, shoot and bust; cruisers pursue by road and ram; at
// wanted 3+ roadblocks cut the road ahead; at wanted 4+ a helicopter watches
// from above and keeps the player seen. Heat cools when nobody sees the
// player: 9 unseen seconds drop one star. A fresh crime always draws a first
// response for 3 seconds, even unseen — after that, units only spawn while
// the player is seen.

import { clamp, dist } from './util.js';
import { nearestRoadPoint, ROAD_STEP } from './city.js';
import { createCar, driveToward } from './vehicles.js';
import { damagePlayer, hasLineOfSight } from './combat.js';
import { updateSiren } from './audio.js';

const COOL_SECONDS = 9;
const FIRST_RESPONSE_SECONDS = 3;
const BUST_SECONDS = 1.1;
const BUST_RANGE = 42;

export function createPolice(game) {
  let coolTimer = 0;
  let lastHeatAt = -100;

  function isSeen() {
    if (game.heli) return true;
    const px = game.player.x;
    const py = game.player.y;
    for (const ped of game.peds) {
      if (!ped.down && dist(ped.x, ped.y, px, py) < 260) return true;
    }
    for (const cop of game.cops) {
      if (dist(cop.x, cop.y, px, py) < 500 && hasLineOfSight(game, cop.x, cop.y, px, py)) return true;
    }
    for (const car of game.cars) {
      if (car.role === 'cruiser' && dist(car.x, car.y, px, py) < 550) return true;
    }
    return false;
  }

  function addWanted(n) {
    const before = game.wanted;
    game.wanted = clamp(game.wanted + n, 0, 5);
    if (game.wanted > before) {
      lastHeatAt = game.time;
      coolTimer = 0;
    }
  }

  function clearWanted() {
    game.wanted = 0;
    coolTimer = 0;
    despawnResponse();
  }

  function setWanted(n) {
    game.wanted = clamp(n, 0, 5);
    lastHeatAt = game.time;
    coolTimer = 0;
    if (game.wanted === 0) despawnResponse();
  }

  function despawnResponse() {
    game.cops.length = 0;
    game.cars = game.cars.filter((c) => c.role !== 'cruiser' || c === game.player.car);
    game.heli = null;
    game.roadblocks = [];
  }

  function spawnPoint(rangeMin, rangeMax) {
    const a = Math.random() * Math.PI * 2;
    const r = rangeMin + Math.random() * (rangeMax - rangeMin);
    const pt = nearestRoadPoint(game.city, game.player.x + Math.cos(a) * r, game.player.y + Math.sin(a) * r);
    return pt;
  }

  function spawnFootCop() {
    const pt = spawnPoint(320, 480);
    game.cops.push({
      x: pt.x,
      y: pt.y,
      hp: 60,
      maxHp: 60,
      angle: 0,
      speed: 205,
      bustTimer: 0,
      shootCd: 0.5 + Math.random(),
      kind: 'cop',
    });
  }

  function spawnCruiser() {
    const pt = spawnPoint(420, 620);
    const car = createCar(game, 'cruiser', pt.x, pt.y, Math.atan2(game.player.y - pt.y, game.player.x - pt.x), 'cruiser');
    car.siren = true;
    return car;
  }

  function updateRoadblocks() {
    if (game.wanted >= 3 && game.roadblocks.length === 0) {
      // Two cruisers parked across the player's current road, ~400px ahead.
      const facing = game.player.car ? game.player.car.angle : game.player.angle;
      const aheadX = game.player.x + Math.cos(facing) * 400;
      const aheadY = game.player.y + Math.sin(facing) * 400;
      const pt = nearestRoadPoint(game.city, aheadX, aheadY);
      const vertical = Math.abs(pt.x - aheadX) < Math.abs(pt.y - aheadY);
      const block = [];
      for (const off of [-34, 34]) {
        const bx = vertical ? pt.x + off : pt.x;
        const by = vertical ? pt.y : pt.y + off;
        const car = createCar(game, 'cruiser', bx, by, vertical ? 0 : Math.PI / 2, 'cruiser');
        car.roadblock = true;
        car.siren = true;
        block.push(car);
      }
      game.roadblocks = block;
      game.effects.floater(game.player.x, game.player.y - 40, 'ROADBLOCK AHEAD!', '#ff5252');
    } else if (game.wanted < 3 && game.roadblocks.length > 0) {
      for (const car of game.roadblocks) {
        const i = game.cars.indexOf(car);
        if (i >= 0) game.cars.splice(i, 1);
      }
      game.roadblocks = [];
    }
  }

  function updateHeli(dt) {
    if (game.wanted >= 4) {
      if (!game.heli) {
        game.heli = { x: game.player.x - 300, y: game.player.y - 300 };
        game.effects.floater(game.player.x, game.player.y - 40, 'AIR ONE IS OVERHEAD', '#ff5252');
      }
      const h = game.heli;
      const tx = game.player.x + 60;
      const ty = game.player.y - 80;
      const d = dist(h.x, h.y, tx, ty);
      const step = Math.min(d, 320 * dt);
      if (d > 1) {
        h.x += ((tx - h.x) / d) * step;
        h.y += ((ty - h.y) / d) * step;
      }
    } else if (game.heli) {
      game.heli = null;
    }
  }

  function update(dt) {
    const wanted = game.wanted;
    updateSiren(wanted > 0 && game.cars.some((c) => c.role === 'cruiser'));
    updateRoadblocks();
    updateHeli(dt);
    if (wanted === 0) {
      if (game.cops.length > 0) game.cops.length = 0;
      return;
    }
    // Heat cools only while unseen.
    if (isSeen()) {
      coolTimer = 0;
    } else {
      coolTimer += dt;
      if (coolTimer >= COOL_SECONDS) {
        coolTimer = 0;
        game.wanted = Math.max(0, game.wanted - 1);
        if (game.wanted === 0) despawnResponse();
      }
    }
    // Spawning: fresh heat always draws a first response; after that, only
    // while the player is seen.
    const fresh = game.time - lastHeatAt < FIRST_RESPONSE_SECONDS;
    const maySpawn = fresh || isSeen();
    const inCar = !!game.player.car;
    if (maySpawn) {
      const wantCops = inCar ? 0 : Math.min(wanted, 3);
      while (game.cops.length < wantCops) spawnFootCop();
      const wantCruisers = inCar && wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
      const live = game.cars.filter((c) => c.role === 'cruiser' && !c.roadblock).length;
      for (let i = live; i < wantCruisers; i++) spawnCruiser();
    }
    // Foot cops: chase, shoot within 380px with line of sight, bust up close.
    const px = game.player.x;
    const py = game.player.y;
    for (const cop of game.cops) {
      const d = dist(cop.x, cop.y, px, py);
      cop.angle = Math.atan2(py - cop.y, px - cop.x);
      if (d > 60) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
      }
      cop.shootCd -= dt;
      if (d < 380 && d > 30 && cop.shootCd <= 0 && hasLineOfSight(game, cop.x, cop.y, px, py)) {
        cop.shootCd = 0.9 + Math.random() * 0.5;
        game.effects.tracer(cop.x, cop.y, px, py);
        game.effects.muzzle(cop.x, cop.y, cop.angle);
        game.sfx('shoot');
        if (Math.random() < 0.45) damagePlayer(game, 6, 'cop');
      }
      if (!inCar && d < BUST_RANGE) {
        cop.bustTimer += dt;
        if (cop.bustTimer >= BUST_SECONDS) {
          game.busted();
          return;
        }
      } else {
        cop.bustTimer = 0;
      }
    }
    // Cruisers: waypoint road-following pursuit, ramming when close. Steering
    // straight at the player's road point cuts across blocks and gets the
    // cruiser stuck sliding on buildings, so the cruiser routes along the
    // grid instead: along its current road to the intersection with the
    // player's road, then along that road toward the player.
    for (const car of game.cars) {
      if (car.role !== 'cruiser' || car.roadblock) continue;
      const d = dist(car.x, car.y, px, py);
      if (d < 220) {
        // Close: drive straight at the player (ramming range), but ease off
        // with distance — a cruiser at full speed overshoots, swings wide
        // turning around, and ends up further away than it started.
        driveToward(game, car, px, py, dt, Math.min(car.maxSpeed, 150 + d));
        car.wp = null;
      } else {
        const pvx = Math.round(px / ROAD_STEP) * ROAD_STEP;
        const phy = Math.round(py / ROAD_STEP) * ROAD_STEP;
        const cvx = Math.round(car.x / ROAD_STEP) * ROAD_STEP;
        const chy = Math.round(car.y / ROAD_STEP) * ROAD_STEP;
        const onV = Math.abs(car.x - cvx) < 40;
        const onH = Math.abs(car.y - chy) < 40;
        const wpStale = !car.wp || dist(car.x, car.y, car.wp.x, car.wp.y) < 60 || game.time - (car.wpAt || 0) > 2;
        if (wpStale) {
          if (onV && Math.abs(car.y - phy) > 80) car.wp = { x: cvx, y: phy };
          else if (onH && Math.abs(car.x - pvx) > 80) car.wp = { x: pvx, y: chy };
          else if (onV) car.wp = { x: cvx, y: py };
          else if (onH) car.wp = { x: px, y: chy };
          else car.wp = nearestRoadPoint(game.city, car.x, car.y);
          car.wpAt = game.time;
        }
        driveToward(game, car, car.wp.x, car.wp.y, dt);
      }
      if (car.hp <= 0) {
        game.effects.smoke(car.x, car.y);
      }
    }
  }

  return { addWanted, clearWanted, setWanted, update, isSeen };
}
