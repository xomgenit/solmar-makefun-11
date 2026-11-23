// SOLMAR people: lane-following traffic and walking pedestrians.
// Traffic drives right-hand lanes along the road grid, turns at intersections,
// stops for obstacles, and recycles when it gets far from the player. Peds
// stroll the sidewalks, flee gunfire and speeding cars, and get knocked down
// when a car hits them — only a knock-down BY THE PLAYER raises wanted.

import { clamp, dist, turnToward } from './util.js';
import { ROAD_STEP, ROAD_W, WORLD, nearestRoadPoint } from './city.js';
import { createCar, MODELS } from './vehicles.js';

const TRAFFIC_MODELS = ['sedan', 'coupe', 'taxi', 'truck', 'sedan', 'coupe'];
const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6'];

let nextPedId = 1;

/** Spawn a traffic car on a road near the player, in the right-hand lane. */
export function spawnTrafficCar(game, nearX = null, nearY = null) {
  const px = nearX ?? game.player.x;
  const py = nearY ?? game.player.y;
  const vertical = Math.random() < 0.5;
  const roadIndex = clamp(Math.round((vertical ? px : py) / ROAD_STEP) + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2)), 1, 11);
  const along = clamp((vertical ? py : px) + (Math.random() - 0.5) * 1200, 100, WORLD - 100);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const lane = 16; // right-hand lane offset
  let x;
  let y;
  let angle;
  if (vertical) {
    x = roadIndex * ROAD_STEP + (dir > 0 ? lane : -lane);
    y = along;
    angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = along;
    y = roadIndex * ROAD_STEP + (dir > 0 ? -lane : lane);
    angle = dir > 0 ? 0 : Math.PI;
  }
  const model = TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)];
  const car = createCar(game, model, x, y, angle, 'traffic');
  car.road = { vertical, index: roadIndex };
  car.dir = dir;
  car.cruise = 130 + Math.random() * 90;
  return car;
}

export function spawnTraffic(game, n) {
  for (let i = 0; i < n; i++) spawnTrafficCar(game);
}

function trafficTarget(car) {
  // The point ahead on the car's current road, in the right-hand lane.
  const lane = 16;
  if (car.road.vertical) {
    const x = car.road.index * ROAD_STEP + (car.dir > 0 ? lane : -lane);
    return { x, y: car.y + car.dir * 120 };
  }
  const y = car.road.index * ROAD_STEP + (car.dir > 0 ? -lane : lane);
  return { x: car.x + car.dir * 120, y };
}

/** Is there an obstacle (car or ped) just ahead of this traffic car? */
function blockedAhead(game, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of game.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 0 && ahead < 78 && Math.abs(-dx * fy + dy * fx) < 26) return true;
  }
  for (const ped of game.peds) {
    if (ped.down) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead > 0 && ahead < 60 && Math.abs(-dx * fy + dy * fx) < 22) return true;
  }
  return false;
}

export function updateTraffic(game, dt) {
  const px = game.player.x;
  const py = game.player.y;
  for (const car of game.cars) {
    if (car.role !== 'traffic') continue;
    // Recycle far cars so the streets around the player stay alive.
    if (dist(car.x, car.y, px, py) > 1500) {
      const fresh = spawnTrafficCar(game, px, py);
      car.x = fresh.x;
      car.y = fresh.y;
      car.angle = fresh.angle;
      car.road = fresh.road;
      car.dir = fresh.dir;
      car.cruise = fresh.cruise;
      game.cars.splice(game.cars.indexOf(fresh), 1);
      continue;
    }
    // At an intersection, sometimes turn onto the crossing road.
    const onV = Math.abs(car.x - Math.round(car.x / ROAD_STEP) * ROAD_STEP) < 40;
    const onH = Math.abs(car.y - Math.round(car.y / ROAD_STEP) * ROAD_STEP) < 40;
    if (onV && onH && Math.random() < dt * 0.9) {
      if (car.road.vertical) {
        car.road = { vertical: false, index: Math.round(car.y / ROAD_STEP) };
        car.dir = Math.random() < 0.5 ? 1 : -1;
      } else {
        car.road = { vertical: true, index: Math.round(car.x / ROAD_STEP) };
        car.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }
    const target = trafficTarget(car);
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    car.angle = turnToward(car.angle, want, 2.2 * dt);
    const stop = blockedAhead(game, car);
    const speed = stop ? 0 : car.cruise;
    car.vx = Math.cos(car.angle) * speed;
    car.vy = Math.sin(car.angle) * speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.speed = speed;
    car.x = clamp(car.x, 20, WORLD - 20);
    car.y = clamp(car.y, 20, WORLD - 20);
    // A traffic car that hits a ped knocks them down — but that is an
    // accident, not the player's crime: byPlayer stays false.
    for (const ped of game.peds) {
      if (!ped.down && dist(car.x, car.y, ped.x, ped.y) < 26 && car.speed > 60) {
        knockDownPed(game, ped, false);
      }
    }
  }
}

export function spawnPed(game, x = null, y = null) {
  const near = x === null ? nearestRoadPoint(game.city, game.player.x + (Math.random() - 0.5) * 900, game.player.y + (Math.random() - 0.5) * 900) : { x, y };
  const ped = {
    id: nextPedId++,
    x: near.x + (Math.random() - 0.5) * 60,
    y: near.y + (Math.random() - 0.5) * 60,
    angle: Math.random() * Math.PI * 2,
    speed: 45 + Math.random() * 30,
    color: PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)],
    down: false,
    downTimer: 0,
    flee: 0,
    tx: near.x,
    ty: near.y,
    wait: 0,
  };
  game.peds.push(ped);
  return ped;
}

export function spawnPeds(game, n) {
  for (let i = 0; i < n; i++) spawnPed(game);
}

/** Knock a ped down. Only byPlayer=true raises the player's wanted level. */
export function knockDownPed(game, ped, byPlayer) {
  if (ped.down) return;
  ped.down = true;
  ped.downTimer = 3 + Math.random() * 3;
  game.effects.blood(ped.x, ped.y);
  game.sfx('crash');
  if (byPlayer && game.police) game.police.addWanted(1);
  for (const other of game.peds) {
    if (other !== ped && dist(other.x, other.y, ped.x, ped.y) < 300) other.flee = 4;
  }
}

export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (dist(ped.x, ped.y, x, y) < radius) ped.flee = 4;
  }
}

export function updatePeds(game, dt) {
  for (const ped of game.peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.down = false;
      continue;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      // Run away from the player (or the last scare point: the player).
      const a = Math.atan2(ped.y - game.player.y, ped.x - game.player.x);
      ped.angle = a;
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
      continue;
    }
    if (ped.wait > 0) {
      ped.wait -= dt;
      continue;
    }
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 12) {
      const next = nearestRoadPoint(game.city, ped.x + (Math.random() - 0.5) * 700, ped.y + (Math.random() - 0.5) * 700);
      ped.tx = next.x + (Math.random() - 0.5) * 50;
      ped.ty = next.y + (Math.random() - 0.5) * 50;
      ped.wait = Math.random() * 2;
      continue;
    }
    ped.angle = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    // A speeding player car nearby makes peds scatter.
    const car = game.player.car;
    if (car && car.speed > 260 && dist(ped.x, ped.y, car.x, car.y) < 130) ped.flee = 3;
  }
  // Keep the crowd topped up near the player.
  if (game.peds.length < 24) spawnPed(game);
}
