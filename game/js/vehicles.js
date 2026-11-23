// SOLMAR vehicles: car models, arcade driving physics, collisions, damage.
// Roles: 'player' (the car Danny drives), 'traffic', 'parked', 'cruiser'.
// Every car lives in game.cars; the player's is game.player.car. car.speed is
// px/s — the speedometer shows speed * 0.36 km/h.

import { clamp, dist, turnToward } from './util.js';
import { collideCircle, WORLD } from './city.js';

export const MODELS = {
  sedan: { w: 44, h: 22, maxSpeed: 470, accel: 380, color: '#7fa8c9', name: 'Sedan' },
  coupe: { w: 42, h: 20, maxSpeed: 520, accel: 430, color: '#c96a4a', name: 'Coupe' },
  sports: { w: 44, h: 20, maxSpeed: 660, accel: 560, color: '#d21f2b', name: 'Sports' },
  truck: { w: 52, h: 24, maxSpeed: 380, accel: 300, color: '#8a7f70', name: 'Truck' },
  taxi: { w: 44, h: 22, maxSpeed: 480, accel: 390, color: '#f2c230', name: 'Taxi' },
  cruiser: { w: 46, h: 22, maxSpeed: 560, accel: 480, color: '#1c3f6e', name: 'Police Cruiser' },
};

let nextCarId = 1;

export function createCar(game, model, x, y, angle, role) {
  const m = MODELS[model] || MODELS.sedan;
  const car = {
    id: nextCarId++,
    model,
    role,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    fwd: 0, // persistent forward speed (px/s) — recomputing it from velocity
    // each frame discards most of the acceleration through the grip lerp
    hp: 100,
    maxHp: 100,
    w: m.w,
    h: m.h,
    color: m.color,
    maxSpeed: m.maxSpeed,
    accel: m.accel,
    hitCd: 0,
    // Traffic AI state (people.js fills these for role 'traffic').
    road: null,
    dir: 1,
    stuck: 0,
    // Cruiser AI state (police.js).
    siren: role === 'cruiser',
    roadblock: false,
  };
  game.cars.push(car);
  return car;
}

/** Damage a car, throttled: a car can only take collision damage every 0.6s. */
export function damageCar(game, car, amount, cause) {
  if (car.hitCd > 0) return false;
  car.hitCd = 0.6;
  car.hp = Math.max(0, car.hp - amount);
  game.effects.sparks(car.x, car.y);
  if (car.hp <= 0) {
    game.effects.smoke(car.x, car.y);
    game.effects.smoke(car.x, car.y);
  }
  if (cause === 'player' && car.role === 'traffic') {
    // Smashing a stranger's car in view of the law draws heat.
    if (game.police && game.police.isSeen()) game.police.addWanted(1);
  }
  return true;
}

function carRadius(car) {
  return Math.max(car.w, car.h) / 2;
}

/**
 * Arcade driving for the player's car. Velocity-vector model: throttle adds
 * forward speed, steering turns the heading (faster turn at low speed, gentle
 * at high speed), handbrake (SPACE) cuts grip so the car drifts and leaves
 * skids. Collisions with buildings and other cars bounce the velocity and
 * cost health.
 */
export function updatePlayerCar(game, car, input, dt) {
  // Forward speed is persistent state on the car (car.fwd). It must NOT be
  // recomputed from velocity each frame: the grip lerp below only moves the
  // velocity a fraction toward the target, so a recomputed fwd would throw
  // away most of each frame's acceleration (measured: 76 px/s^2, not 560).
  let fwd = car.fwd;
  const handbrake = input.keys.has('Space');
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) fwd += car.accel * dt;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) fwd -= car.accel * 0.7 * dt;
  if (!input.keys.has('KeyW') && !input.keys.has('ArrowUp') && !input.keys.has('KeyS') && !input.keys.has('ArrowDown')) {
    fwd -= fwd * Math.min(1, (handbrake ? 2.2 : 0.6) * dt);
  }
  fwd = clamp(fwd, -160, car.maxSpeed);
  car.fwd = fwd;
  const speed01 = clamp(Math.abs(fwd) / car.maxSpeed, 0, 1);
  const steer = (input.keys.has('KeyA') || input.keys.has('ArrowLeft') ? -1 : 0) + (input.keys.has('KeyD') || input.keys.has('ArrowRight') ? 1 : 0);
  const turnRate = (handbrake ? 3.4 : 2.3) * (1 - speed01 * 0.55);
  if (steer !== 0 && Math.abs(fwd) > 20) {
    car.angle += steer * turnRate * dt * Math.sign(fwd);
  }
  // Grip: velocity snaps toward the heading, slowly while drifting.
  const grip = handbrake ? 1.6 : 8;
  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  const targetVx = nx * fwd;
  const targetVy = ny * fwd;
  car.vx += (targetVx - car.vx) * Math.min(1, grip * dt);
  car.vy += (targetVy - car.vy) * Math.min(1, grip * dt);
  if (handbrake && Math.abs(fwd) > 200 && Math.random() < 0.6) {
    game.effects.skid(car.x - nx * 16, car.y - ny * 16, car.angle);
  }
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
  collideCarWithWorld(game, car);
  return speed01;
}

/** Building + world-edge collision for a car; bounces velocity, costs health. */
export function collideCarWithWorld(game, car) {
  const r = carRadius(car);
  const before = { x: car.x, y: car.y };
  const fixed = collideCircle(game.city, car.x, car.y, r);
  car.x = fixed.x;
  car.y = fixed.y;
  const hitWall = fixed.x !== before.x || fixed.y !== before.y;
  if (hitWall) {
    const impact = car.speed;
    // Kill the velocity component into the wall, keep the slide.
    const nx = fixed.x - before.x;
    const ny = fixed.y - before.y;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    const into = (car.vx * nx + car.vy * ny) / nl;
    if (into < 0) {
      car.vx -= (nx / nl) * into * 1.4;
      car.vy -= (ny / nl) * into * 1.4;
      // A wall hit kills forward speed: resync the persistent fwd state.
      car.fwd = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
    }
    if (impact > 220) {
      damageCar(game, car, Math.min(22, (impact - 200) / 18), car.role === 'player' ? 'player' : 'world');
      game.sfx('crash');
      game.effects.addShake(3);
    }
  }
  // Car-car collisions: circle push-apart + velocity exchange.
  for (const other of game.cars) {
    if (other === car) continue;
    const rr = carRadius(car) + carRadius(other);
    const d = dist(car.x, car.y, other.x, other.y);
    if (d >= rr || d < 0.01) continue;
    const push = (rr - d) / 2;
    const ux = (car.x - other.x) / d;
    const uy = (car.y - other.y) / d;
    car.x += ux * push;
    car.y += uy * push;
    other.x -= ux * push;
    other.y -= uy * push;
    const rel = Math.abs((car.vx - other.vx) * ux + (car.vy - other.vy) * uy);
    const swap = ((car.vx - other.vx) * ux + (car.vy - other.vy) * uy) / 2;
    car.vx -= ux * swap;
    car.vy -= uy * swap;
    other.vx += ux * swap;
    other.vy += uy * swap;
    car.fwd = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
    other.fwd = other.vx * Math.cos(other.angle) + other.vy * Math.sin(other.angle);
    if (rel > 160) {
      damageCar(game, car, Math.min(18, rel / 20), car.role === 'player' ? 'player' : 'world');
      damageCar(game, other, Math.min(18, rel / 20), 'world');
      game.sfx('crash');
      if (car.role === 'player') game.effects.addShake(4);
    }
  }
  car.x = clamp(car.x, r, WORLD - r);
  car.y = clamp(car.y, r, WORLD - r);
  car.speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
}

/** Steer a non-player car toward a target point (cruisers, scripted cars). */
export function driveToward(game, car, tx, ty, dt, maxSpeed = null) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const top = maxSpeed ?? car.maxSpeed;
  car.angle = turnToward(car.angle, want, 2.6 * dt);
  const fwd = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  const next = clamp(fwd + car.accel * dt, 0, top);
  car.vx = Math.cos(car.angle) * next;
  car.vy = Math.sin(car.angle) * next;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = next;
  collideCarWithWorld(game, car);
}

export function updateCarTimers(game, dt) {
  for (const car of game.cars) {
    if (car.hitCd > 0) car.hitCd -= dt;
  }
}
