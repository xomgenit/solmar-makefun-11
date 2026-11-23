// SOLMAR — Streets of the Sun. The boot + loop + input + screens.
// One `game` object for the whole session, reset in place: window.__solmar.game
// never goes stale across NEW GAME / CONTINUE. States: title / playing /
// paused / wasted / busted. URL params: ?seed=N (deterministic city),
// ?autostart=1 (skip the title screen).

import { buildCity, zoneAt, collideCircle, onRoad, WORLD } from './city.js';
import { createEffects } from './effects.js';
import { createPolice } from './police.js';
import { createMissions, ensureGoldCar } from './missions.js';
import { createCar, updatePlayerCar, updateCarTimers, MODELS } from './vehicles.js';
import { spawnTraffic, spawnPeds, updateTraffic, updatePeds, knockDownPed } from './people.js';
import { shoot, updateEnemies, updatePlayerHealth, WEAPON_ORDER, spawnEnemy, hasLineOfSight } from './combat.js';
import { updateHUD, showBanner } from './hud.js';
import { drawWorld } from './render.js';
import { saveGame, loadSave, hasSave } from './save.js';
import { ensureAudio, sfx, startRadio, nextStation, stopAllLoops, updateEngine, currentStation } from './audio.js';
import { dist, clamp } from './util.js';

const VW = 1280;
const VH = 720;
const WALK_SPEED = 170;
const SPRINT_SPEED = 300;
const START_CASH = 200;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// The single game object. resetGame() refills it in place.
const game = {
  seed: 7,
  city: null,
  state: 'title',
  time: 0,
  player: null,
  cars: [],
  peds: [],
  enemies: [],
  cops: [],
  roadblocks: [],
  heli: null,
  wanted: 0,
  missionMarker: null,
  objective: null,
  hint: '',
  zoneName: 'Sunset Row',
  cam: { x: 0, y: 0 },
  vw: VW,
  vh: VH,
  input: { keys: new Set(), mouse: { x: VW / 2, y: VH / 2, down: false }, mouseWorld: { x: 0, y: 0 } },
  effects: null,
  police: null,
  missions: null,
  radioStation: 0,
  sfx(name) {
    if (sfx[name]) sfx[name]();
  },
  showBanner(title, sub) {
    showBanner(title, sub);
  },
  saveNow() {
    saveGame(game);
  },
  wasted(source) {
    if (game.state !== 'playing') return;
    game.state = 'wasted';
    stopAllLoops();
    game.sfx('wasted');
    game.player.cash = Math.max(0, game.player.cash - 100);
    document.getElementById('wasted-reason').textContent = source === 'cop' ? 'Taken down by the Solmar PD.' : 'You were wasted.';
    document.getElementById('wasted-fine').textContent = 'Hospital bill: $100';
    showScreen('wasted-screen');
  },
  busted() {
    if (game.state !== 'playing') return;
    game.state = 'busted';
    stopAllLoops();
    game.sfx('wasted');
    game.player.cash = Math.max(0, game.player.cash - 150);
    document.getElementById('busted-fine').textContent = 'Bail: $150';
    showScreen('busted-screen');
  },
};

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('show');
  const target = document.getElementById(id);
  if (target) target.classList.add('show');
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = game.state === 'playing' || game.state === 'paused' ? 'block' : 'none';
}

function resetGame(seed, saved = null) {
  game.seed = seed;
  game.city = buildCity(seed);
  game.time = 0;
  game.cars = [];
  game.peds = [];
  game.enemies = [];
  game.cops = [];
  game.roadblocks = [];
  game.heli = null;
  game.wanted = 0;
  game.race = null;
  game.shopOpen = false;
  game.missionMarker = null;
  game.objective = null;
  game.hint = '';
  game.effects = createEffects();
  const hideout = game.city.landmarkById.hideout;
  game.player = {
    x: saved ? saved.x : hideout.cx,
    y: saved ? saved.y : 600,
    angle: 0,
    hp: saved ? saved.hp : 100,
    maxHp: saved && saved.maxHp ? saved.maxHp : 100,
    cash: saved ? saved.cash : START_CASH,
    car: null,
    weapon: saved && saved.weapon ? saved.weapon : 'pistol',
    upgrades: saved && saved.upgrades ? { ...saved.upgrades } : {},
    lastShotAt: -10,
    lastHurtAt: -100,
    speed: 0,
  };
  game.radioStation = saved ? saved.station || 0 : 0;
  game.police = createPolice(game);
  game.missions = createMissions(game);
  if (saved && saved.missions) {
    game.missions.restore(saved.missions);
  } else {
    // NEW GAME starts Vera's job chain — mission 1, with $200 in pocket.
    game.missions.start('first-wheels');
  }
  // The player's first ride: a red sports car parked in the eastbound lane of
  // the road south of the hideout (y=600 road, eastbound lane y=584) — on a
  // road, never inside a block, so it can actually drive.
  createCar(game, 'sports', 520, 584, 0, 'parked');
  createCar(game, 'sedan', 1180, 316, Math.PI, 'parked');
  createCar(game, 'taxi', 884, 1500, Math.PI / 2, 'parked');
  createCar(game, 'coupe', 2100, 884, 0, 'parked');
  spawnTraffic(game, 10);
  spawnPeds(game, 24);
  // Vera's gold sports car: re-spawn on CONTINUE if earned and missing.
  if (game.missions.goldCarEarned) ensureGoldCar(game);
  // A few Harbor Kings hanging around their HQ.
  const hq = game.city.landmarkById.ganghq;
  spawnEnemy(game, hq.cx - 140, hq.cy, 'king');
  spawnEnemy(game, hq.cx + 140, hq.cy + 40, 'king');
  spawnEnemy(game, hq.cx, hq.cy - 140, 'king');
  game.cam.x = clamp(game.player.x - VW / 2, 0, WORLD - VW);
  game.cam.y = clamp(game.player.y - VH / 2, 0, WORLD - VH);
}

function startNewGame() {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 100000);
  resetGame(seed);
  game.state = 'playing';
  showScreen(null);
  ensureAudio();
  startRadio(game.radioStation);
  showBanner('SOLMAR BAY', 'Danny "Dice" Marlow is back in town');
}

function continueGame() {
  const saved = loadSave();
  if (!saved) return;
  resetGame(saved.seed, saved);
  game.state = 'playing';
  showScreen(null);
  ensureAudio();
  startRadio(game.radioStation);
  showBanner('WELCOME BACK', `Cash $${Math.floor(game.player.cash)} — same city, same streets`);
}

function respawnAfterWasted() {
  const hospital = game.city.landmarkById.hospital;
  game.player.hp = game.player.maxHp;
  game.player.x = hospital.cx;
  game.player.y = hospital.cy + 120;
  game.player.car = null;
  game.police.clearWanted();
  game.state = 'playing';
  showScreen(null);
  game.saveNow();
}

function respawnAfterBusted() {
  const hideout = game.city.landmarkById.hideout;
  game.player.hp = game.player.maxHp;
  game.player.x = hideout.cx;
  game.player.y = 600;
  game.player.car = null;
  game.police.clearWanted();
  game.state = 'playing';
  showScreen(null);
  game.saveNow();
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    stopAllLoops();
    document.getElementById('pause-stats').textContent = `Cash $${Math.floor(game.player.cash)} · Health ${Math.ceil(game.player.hp)} · Wanted ${game.wanted}★ · Zone ${game.zoneName}`;
    showScreen('pause-screen');
  } else if (game.state === 'paused') {
    game.state = 'playing';
    showScreen(null);
    startRadio(game.radioStation);
  }
}

function nearestCar(range) {
  let best = null;
  let bestD = range;
  for (const car of game.cars) {
    const d = dist(game.player.x, game.player.y, car.x, car.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function tryStealOrExit() {
  const p = game.player;
  if (p.car) {
    // Exit: step out to the car's left side.
    const car = p.car;
    p.car = null;
    car.role = 'parked';
    const sx = Math.cos(car.angle + Math.PI / 2);
    const sy = Math.sin(car.angle + Math.PI / 2);
    const pos = collideCircle(game.city, car.x + sx * 34, car.y + sy * 34, 12);
    p.x = pos.x;
    p.y = pos.y;
    p.angle = car.angle;
    return;
  }
  const car = nearestCar(85);
  if (!car) return;
  if (car.role === 'cruiser' && game.wanted > 0) {
    game.hint = 'Too hot to steal a cruiser right now!';
    return;
  }
  p.car = car;
  car.role = 'player';
  applyUpgradesToCar(car);
  p.x = car.x;
  p.y = car.y;
  game.sfx('steal');
  if (!car.stolenByPlayer) {
    car.stolenByPlayer = true;
    // A theft seen by a witness draws heat.
    if (game.police.isSeen()) game.police.addWanted(1);
  }
}

function tryInteract() {
  const p = game.player;
  const hospital = game.city.landmarkById.hospital;
  const spa = game.city.landmarkById.spa;
  // Respect perks: Known (2) halves the hospital bill, Respected (4) halves
  // the respray.
  const respect = game.missions ? game.missions.respect : 0;
  const healCost = respect >= 2 ? 50 : 100;
  const sprayCost = respect >= 4 ? 75 : 150;
  if (!p.car && dist(p.x, p.y, hospital.cx, hospital.cy) < 170) {
    if (p.hp >= p.maxHp) {
      game.hint = 'Already at full health.';
      return;
    }
    if (p.cash < healCost) {
      game.hint = `Healing costs $${healCost} — not enough cash.`;
      return;
    }
    p.cash -= healCost;
    p.hp = p.maxHp;
    game.sfx('heal');
    game.effects.floater(p.x, p.y - 30, `HEALED -$${healCost}`, '#7CFC00');
    return;
  }
  if (p.car && dist(p.x, p.y, spa.cx, spa.cy) < 170) {
    if (p.cash < sprayCost) {
      game.hint = `Respray costs $${sprayCost} — not enough cash.`;
      return;
    }
    p.cash -= sprayCost;
    p.car.hp = p.car.maxHp;
    game.police.clearWanted();
    game.sfx('heal');
    game.effects.floater(p.x, p.y - 30, `RESPRAYED -$${sprayCost}`, '#7CFC00');
    showBanner('SUNSET AUTO SPA', 'Fresh paint. The law lost your trail.');
  }
}

// ---- garage shop -----------------------------------------------------------
// Bay City Garage: press G within 200px to open a small DOM panel. Upgrades
// are owned by the PLAYER (persisted in the save) and applied to every car
// he drives, so they survive CONTINUE even though the car itself does not.

function applyUpgradesToCar(car) {
  const up = game.player.upgrades || {};
  const base = MODELS[car.model] || MODELS.sedan;
  if (up.armor && !car.hasArmor) {
    car.hasArmor = true;
    car.maxHp = 150;
    car.hp = Math.min(150, car.hp + 50);
  }
  if (up.engine && !car.hasEngine) {
    car.hasEngine = true;
    car.maxSpeed = Math.round(base.maxSpeed * 1.15);
  }
}

function refreshShop() {
  const p = game.player;
  const up = p.upgrades || {};
  const respect = game.missions ? game.missions.respect : 0;
  const repairCost = respect >= 8 ? 0 : 50; // Legend: free repairs
  const hasCar = !!p.car;
  const setBtn = (id, label, enabled) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = label;
    b.disabled = !enabled;
  };
  setText('shop-cash', `Cash $${Math.floor(p.cash)}`);
  setBtn('shop-repair', repairCost === 0 ? 'Repair — FREE (Legend)' : `Repair — $${repairCost}`, hasCar && p.cash >= repairCost && p.car.hp < p.car.maxHp);
  setBtn('shop-armor', up.armor ? 'Armor — OWNED (+50 max HP)' : 'Armor — $300 (+50 max car HP)', hasCar && !up.armor && p.cash >= 300);
  setBtn('shop-engine', up.engine ? 'Engine — OWNED (+15% top speed)' : 'Engine — $500 (+15% top speed)', hasCar && !up.engine && p.cash >= 500);
  setText('shop-status', !hasCar ? 'No car — steal one first.' : '');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function openShop() {
  const garage = game.city.landmarkById.garage;
  if (dist(game.player.x, game.player.y, garage.cx, garage.cy) >= 200) {
    game.hint = 'Get closer to Bay City Garage to open the shop.';
    return;
  }
  game.shopOpen = true;
  refreshShop();
  const panel = document.getElementById('shop-panel');
  if (panel) panel.classList.add('show');
  game.sfx('click');
}

function closeShop() {
  game.shopOpen = false;
  const panel = document.getElementById('shop-panel');
  if (panel) panel.classList.remove('show');
}

function buyShopItem(item) {
  const p = game.player;
  const respect = game.missions ? game.missions.respect : 0;
  if (!p.car) return;
  if (item === 'repair') {
    const cost = respect >= 8 ? 0 : 50;
    if (p.cash < cost || p.car.hp >= p.car.maxHp) return;
    p.cash -= cost;
    p.car.hp = p.car.maxHp;
    game.sfx('heal');
    game.effects.floater(p.x, p.y - 30, cost === 0 ? 'REPAIRED — FREE' : `REPAIRED -$${cost}`, '#7CFC00');
  } else if (item === 'armor') {
    if (p.upgrades.armor || p.cash < 300) return;
    p.cash -= 300;
    p.upgrades.armor = true;
    applyUpgradesToCar(p.car);
    game.sfx('cash');
  } else if (item === 'engine') {
    if (p.upgrades.engine || p.cash < 500) return;
    p.cash -= 500;
    p.upgrades.engine = true;
    applyUpgradesToCar(p.car);
    game.sfx('cash');
  }
  game.saveNow();
  refreshShop();
}

function updateHint() {
  const p = game.player;
  const hospital = game.city.landmarkById.hospital;
  const spa = game.city.landmarkById.spa;
  const garage = game.city.landmarkById.garage;
  const respect = game.missions ? game.missions.respect : 0;
  if (dist(p.x, p.y, garage.cx, garage.cy) < 200) {
    game.hint = 'G — Garage Shop (repair · armor · engine)';
    return;
  }
  if (p.car) {
    if (dist(p.x, p.y, spa.cx, spa.cy) < 170) game.hint = `F — Respray $${respect >= 4 ? 75 : 150} (clears wanted, repairs car)`;
    else game.hint = 'E — Exit car · SPACE — Handbrake · R — Radio';
    return;
  }
  if (dist(p.x, p.y, hospital.cx, hospital.cy) < 170 && p.hp < p.maxHp) {
    game.hint = `F — Heal $${respect >= 2 ? 50 : 100}`;
    return;
  }
  const car = nearestCar(85);
  if (car) {
    game.hint = 'E — Steal car';
    return;
  }
  game.hint = 'WASD — Move · SHIFT — Sprint · Click — Shoot · 1/2/3 — Weapons';
}

function updatePlayer(dt) {
  const p = game.player;
  const keys = game.input.keys;
  if (game.shopOpen) {
    p.speed = 0;
    updateEngine(false, 0);
    return; // browsing the shop — the car waits
  }
  if (p.car) {
    const car = p.car;
    const speed01 = updatePlayerCar(game, car, game.input, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    updateEngine(true, speed01);
    // Running a ped down is the player's crime.
    for (const ped of game.peds) {
      if (!ped.down && car.speed > 80 && dist(car.x, car.y, ped.x, ped.y) < 26) {
        knockDownPed(game, ped, true);
      }
    }
    return;
  }
  updateEngine(false, 0);
  let mx = 0;
  let my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    p.angle = Math.atan2(my, mx);
    const pos = collideCircle(game.city, p.x + mx * speed * dt, p.y + my * speed * dt, 12);
    p.x = pos.x;
    p.y = pos.y;
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  if (game.input.mouse.down) shoot(game);
}

function update(dt) {
  game.time += dt;
  game.input.mouseWorld.x = game.input.mouse.x + game.cam.x;
  game.input.mouseWorld.y = game.input.mouse.y + game.cam.y;
  updatePlayer(dt);
  updateTraffic(game, dt);
  updatePeds(game, dt);
  updateEnemies(game, dt);
  updatePlayerHealth(game, dt);
  updateCarTimers(game, dt);
  game.police.update(dt);
  game.missions.update(dt);
  game.effects.updateEffects(dt);
  game.zoneName = zoneAt(game.player.x, game.player.y);
  updateHint();
  // Camera follows the player, clamped to the world.
  game.cam.x = clamp(game.player.x - VW / 2, 0, WORLD - VW);
  game.cam.y = clamp(game.player.y - VH / 2, 0, WORLD - VH);
  // Keep the shop buttons live while the panel is open — cash and car HP can
  // change behind it (a disabled Repair button after fresh damage is a trap).
  if (game.shopOpen) refreshShop();
  updateHUD(game);
}

let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (game.state === 'playing') {
    update(dt);
  } else if (game.state === 'title') {
    // Attract mode: slow pan around downtown.
    game.time += dt;
    const cx = 1800 + Math.cos(game.time * 0.08) * 500;
    const cy = 1800 + Math.sin(game.time * 0.08) * 500;
    game.cam.x = clamp(cx - VW / 2, 0, WORLD - VW);
    game.cam.y = clamp(cy - VH / 2, 0, WORLD - VH);
  }
  ctx.clearRect(0, 0, VW, VH);
  if (game.city) drawWorld(game, ctx, game.cam, VW, VH);
  requestAnimationFrame(loop);
}

// ---- input ---------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (game.shopOpen) {
      closeShop();
      return;
    }
    if (game.state === 'playing' || game.state === 'paused') togglePause();
    return;
  }
  if (game.state !== 'playing') return;
  game.input.keys.add(e.code);
  if (e.code === 'KeyE') tryStealOrExit();
  if (e.code === 'KeyF') tryInteract();
  if (e.code === 'KeyG') {
    if (game.shopOpen) closeShop();
    else openShop();
  }
  if (e.code === 'KeyR') {
    game.radioStation = nextStation();
    showBanner(currentStation(), 'Radio');
  }
  if (e.code === 'Digit1') game.player.weapon = WEAPON_ORDER[0];
  if (e.code === 'Digit2') game.player.weapon = WEAPON_ORDER[1];
  if (e.code === 'Digit3') game.player.weapon = WEAPON_ORDER[2];
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  game.input.keys.delete(e.code);
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  game.input.mouse.x = e.clientX - rect.left;
  game.input.mouse.y = e.clientY - rect.top;
  game.input.mouseWorld.x = game.input.mouse.x + game.cam.x;
  game.input.mouseWorld.y = game.input.mouse.y + game.cam.y;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  ensureAudio();
  game.input.mouse.down = true;
  if (game.state === 'playing' && !game.player.car) shoot(game);
});

window.addEventListener('mouseup', () => {
  game.input.mouse.down = false;
});

// ---- screens ---------------------------------------------------------------

document.getElementById('btn-new').addEventListener('click', () => {
  game.sfx('click');
  startNewGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  game.sfx('click');
  continueGame();
});
document.getElementById('btn-save').addEventListener('click', () => {
  game.saveNow();
  game.sfx('cash');
  document.getElementById('pause-stats').textContent = 'Game saved.';
});
document.getElementById('btn-restart-mission').addEventListener('click', () => {
  game.missions.restartCurrent();
  togglePause();
});
document.getElementById('btn-quit').addEventListener('click', () => {
  game.saveNow();
  game.state = 'title';
  showScreen('title-screen');
  document.getElementById('btn-continue').disabled = !hasSave();
});
document.getElementById('btn-respawn').addEventListener('click', respawnAfterWasted);
document.getElementById('btn-bail').addEventListener('click', respawnAfterBusted);
document.getElementById('shop-repair').addEventListener('click', () => buyShopItem('repair'));
document.getElementById('shop-armor').addEventListener('click', () => buyShopItem('armor'));
document.getElementById('shop-engine').addEventListener('click', () => buyShopItem('engine'));
document.getElementById('shop-close').addEventListener('click', () => closeShop());

// ---- debug hooks -----------------------------------------------------------

window.__solmar = {
  game,
  teleport(x, y) {
    game.player.x = x;
    game.player.y = y;
    if (game.player.car) {
      game.player.car.x = x;
      game.player.car.y = y;
      game.player.car.vx = 0;
      game.player.car.vy = 0;
      game.player.car.speed = 0;
      game.player.car.fwd = 0;
    }
    game.cam.x = clamp(x - VW / 2, 0, WORLD - VW);
    game.cam.y = clamp(y - VH / 2, 0, WORLD - VH);
  },
  setWanted(n) {
    game.police.setWanted(n);
  },
  giveCash(n) {
    game.player.cash += n;
  },
  zone() {
    return zoneAt(game.player.x, game.player.y);
  },
  los(x1, y1, x2, y2) {
    return hasLineOfSight(game, x1, y1, x2, y2);
  },
  // Spot verification: returns the collideCircle-corrected point + how far
  // it was pushed (0 = the spot is walkable as-is).
  collide(x, y, r) {
    const fixed = collideCircle(game.city, x, y, r);
    return { x: fixed.x, y: fixed.y, pushed: Math.hypot(fixed.x - x, fixed.y - y) };
  },
  onRoad(x, y) {
    return onRoad(x, y);
  },
};

// ---- boot ------------------------------------------------------------------

(function boot() {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed')) || 7;
  resetGame(seed);
  document.getElementById('btn-continue').disabled = !hasSave();
  if (params.get('autostart') === '1') {
    game.state = 'playing';
    showScreen(null);
  } else {
    game.state = 'title';
    showScreen('title-screen');
  }
  requestAnimationFrame(loop);
})();
