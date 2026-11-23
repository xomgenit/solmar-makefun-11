// SOLMAR missions: Vera's job chain (8 story missions) + free roam, the
// respect system, hidden cash stashes, and the gold sports-car unlock.
//
// Def shape (fixed by the runner):
//   { id, title, brief, reward, next,
//     start(game, ms),                       // set the first objective
//     update(game, ms, dt) -> 'done'|'failed'|undefined,
//     onEnemyDown(game, ms, enemy),           // optional
//     onEnd(game, ms) }                       // optional cleanup (race cars,
//                                            // mission kings) — runs when
//                                            // the mission ends any way
//
// Per-mission state lives in ms.current.state (a fresh {} per start).
// Persistent flags (pierPaid, stashesTaken, goldCarEarned) live in the
// missions closure, NOT in per-start state — a restart must never re-pay a
// one-time reward. Respect = completed story missions (free roam never
// completes, so completed.size IS the respect count).

import { createCar, driveToward } from './vehicles.js';
import { spawnEnemy } from './combat.js';
import { ROAD_STEP } from './city.js';

// Hidden cash stashes: $300 each, pay-once, live in every mission + free
// roam. Every spot was verified against buildCity(7) with collideCircle at
// 0px push before use — never assume a spot is walkable.
export const STASHES = [
  { x: 3300, y: 600, note: 'beach north' },
  { x: 3300, y: 2700, note: 'beach south' },
  { x: 3504, y: 1800, note: 'pier deck' },
  { x: 268, y: 268, note: 'sunset row corner' },
  { x: 2968, y: 2968, note: 'kingside corner' },
];
export const STASH_REWARD = 300;

// Street race: 5 checkpoint gates, all on road centrelines (verified with
// collideCircle 0px push + onRoad before use). Start line (600,600).
export const RACE_START = { x: 600, y: 600 };
export const RACE_GATES = [
  { x: 900, y: 600 },
  { x: 2100, y: 600 },
  { x: 2100, y: 1800 },
  { x: 900, y: 1800 },
  { x: 1500, y: 1200 },
];
export const RACE_GATE_RADIUS = 130;

// Vera's thank-you car after mission 3: a gold sports car parked on the
// road south of the garage (verified 0px push).
export const GOLD_CAR_SPOT = { x: 1350, y: 900 };
export const GOLD_CAR_COLOR = '#f1c40f';

export const RESPECT_RANKS = [
  { at: 0, name: 'Nobody' },
  { at: 2, name: 'Known' },
  { at: 4, name: 'Respected' },
  { at: 6, name: 'Feared' },
  { at: 8, name: 'Legend' },
];

export function respectRankName(respect) {
  let name = 'Nobody';
  for (const r of RESPECT_RANKS) if (respect >= r.at) name = r.name;
  return name;
}

function lm(game, id) {
  return game.city.landmarkById[id];
}

function dTo(game, x, y) {
  return Math.hypot(game.player.x - x, game.player.y - y);
}

/** Route a race car along the road grid toward a gate (same waypoint trick
 *  as the police cruisers: along your own road to the intersection with the
 *  target's road, then along that road). Direct steering cuts across blocks
 *  and gets stuck sliding on buildings. */
function driveRacer(game, car, tx, ty, dt) {
  const d = Math.hypot(car.x - tx, car.y - ty);
  if (d < 220) {
    driveToward(game, car, tx, ty, dt, Math.min(car.maxSpeed, 150 + d));
    car.wp = null;
    return;
  }
  const tvx = Math.round(tx / ROAD_STEP) * ROAD_STEP;
  const thy = Math.round(ty / ROAD_STEP) * ROAD_STEP;
  const cvx = Math.round(car.x / ROAD_STEP) * ROAD_STEP;
  const chy = Math.round(car.y / ROAD_STEP) * ROAD_STEP;
  const onV = Math.abs(car.x - cvx) < 40;
  const onH = Math.abs(car.y - chy) < 40;
  const wpStale = !car.wp || Math.hypot(car.x - car.wp.x, car.y - car.wp.y) < 60 || game.time - (car.wpAt || 0) > 2;
  if (wpStale) {
    if (onV && Math.abs(car.y - thy) > 80) car.wp = { x: cvx, y: thy };
    else if (onH && Math.abs(car.x - tvx) > 80) car.wp = { x: tvx, y: chy };
    else if (onV) car.wp = { x: cvx, y: ty };
    else if (onH) car.wp = { x: tx, y: chy };
    else car.wp = { x: cvx, y: car.y };
    car.wpAt = game.time;
  }
  driveToward(game, car, car.wp.x, car.wp.y, dt);
}

function removeTaggedEnemies(game, tag) {
  game.enemies = game.enemies.filter((e) => e.mission !== tag);
}

function spawnMissionKing(game, x, y, tag) {
  const e = spawnEnemy(game, x, y, 'king');
  e.mission = tag;
  return e;
}

export const MISSION_DEFS = {
  'first-wheels': {
    id: 'first-wheels',
    title: 'First Wheels',
    brief: "Vera needs a driver. Steal a car and bring it to Bay City Garage.",
    reward: 250,
    next: 'the-pickup',
    start(game, ms) {
      ms.setObjective('Steal a car (E) — the red sports car is right there', { x: 520, y: 584 });
    },
    update(game, ms) {
      const garage = lm(game, 'garage');
      if (!game.player.car) {
        ms.setObjective('Steal a car (E) — the red sports car is right there', { x: 520, y: 584 });
        return undefined;
      }
      ms.setObjective('Drive it to Bay City Garage', { x: garage.cx, y: garage.cy });
      if (dTo(game, garage.cx, garage.cy) < 200) return 'done';
      return undefined;
    },
  },

  'the-pickup': {
    id: 'the-pickup',
    title: 'The Pickup',
    brief: 'A package is waiting at Harbor Docks. Collect it, deliver it to Sunny Side Diner.',
    reward: 400,
    next: 'hot-delivery',
    start(game, ms) {
      ms.setObjective('Pick up the package at Harbor Docks', { x: lm(game, 'docks').cx, y: lm(game, 'docks').cy });
    },
    update(game, ms) {
      const docks = lm(game, 'docks');
      const diner = lm(game, 'diner');
      const st = ms.current.state;
      if (!st.picked) {
        if (dTo(game, docks.cx, docks.cy) < 120) {
          st.picked = true;
          game.effects.floater(game.player.x, game.player.y - 30, 'PACKAGE PICKED UP', '#ffd34d');
          game.sfx('cash');
          ms.setObjective('Deliver the package to Sunny Side Diner', { x: diner.cx, y: diner.cy });
        }
        return undefined;
      }
      ms.setObjective('Deliver the package to Sunny Side Diner', { x: diner.cx, y: diner.cy });
      if (dTo(game, diner.cx, diner.cy) < 200) return 'done';
      return undefined;
    },
  },

  'hot-delivery': {
    id: 'hot-delivery',
    title: 'Hot Delivery',
    brief: 'Ninety seconds to get the goods to the Docks. Late pays nothing.',
    reward: 600,
    next: 'street-heat',
    start(game, ms) {
      ms.current.state.t = 90;
      ms.setObjective('Deliver to the Docks — 90s left', { x: lm(game, 'docks').cx, y: lm(game, 'docks').cy });
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      st.t -= dt;
      const docks = lm(game, 'docks');
      if (dTo(game, docks.cx, docks.cy) < 200) return 'done';
      if (st.t <= 0) {
        // Timeout pays $0 and restarts the mission in place — the chain
        // stays intact, the timer resets.
        game.showBanner('TOO SLOW', 'The deal went cold — $0. Try again.');
        ms.restartCurrent();
        return undefined;
      }
      ms.setObjective(`Deliver to the Docks — ${Math.ceil(st.t)}s left`, { x: docks.cx, y: docks.cy });
      return undefined;
    },
  },

  'street-heat': {
    id: 'street-heat',
    title: 'Street Heat',
    brief: 'A street race across Solmar Bay. Five gates — finish in the top 2.',
    reward: 500,
    next: 'payback-pier',
    start(game, ms) {
      // Vera's thank-you for mission 3: the gold sports car. Earned here,
      // the moment the chain reaches the race — one floater, not a banner,
      // so it never swallows the MISSION PASSED banner.
      if (!ms.goldCarEarned && ms.isComplete('hot-delivery')) {
        ms.goldCarEarned = true;
        ensureGoldCar(game);
        game.effects.floater(game.player.x, game.player.y - 30, 'VERA: GOLD SPORTS CAR SOUTH OF THE GARAGE', '#f1c40f');
        game.saveNow();
      }
      ms.current.state.phase = 'to-start';
      ms.setObjective('Drive to the start line — Sunset Row', { x: RACE_START.x, y: RACE_START.y });
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      if (st.phase === 'to-start') {
        if (game.player.car && dTo(game, RACE_START.x, RACE_START.y) < 150) {
          // Line up 3 AI racers behind the player and light the race.
          const colors = ['#e74c3c', '#3498db', '#9b59b6'];
          const tops = [540, 560, 520];
          const racers = [];
          for (let i = 0; i < 3; i++) {
            const car = createCar(game, 'coupe', RACE_START.x - 60 - i * 60, RACE_START.y, 0, 'racer');
            car.color = colors[i];
            car.maxSpeed = tops[i];
            car.race = { gates: 0, finished: false };
            racers.push(car);
          }
          game.race = { gates: RACE_GATES, racers, playerGates: 0 };
          st.phase = 'racing';
          st.playerGates = 0;
          game.showBanner('STREET RACE', '5 gates — finish in the top 2');
          game.sfx('cash');
        }
        return undefined;
      }
      // Racing.
      const race = game.race;
      if (!race) return undefined;
      const gates = race.gates;
      // Move the AI racers along the route.
      for (const car of race.racers) {
        if (car.race.finished) continue;
        const g = gates[car.race.gates];
        driveRacer(game, car, g.x, g.y, dt);
        if (Math.hypot(car.x - g.x, car.y - g.y) < RACE_GATE_RADIUS) {
          car.race.gates += 1;
          if (car.race.gates >= gates.length) car.race.finished = true;
        }
      }
      // Player gates.
      const next = gates[Math.min(st.playerGates, gates.length - 1)];
      if (st.playerGates < gates.length && dTo(game, next.x, next.y) < RACE_GATE_RADIUS) {
        st.playerGates += 1;
        race.playerGates = st.playerGates;
        game.effects.floater(game.player.x, game.player.y - 30, `GATE ${st.playerGates}/5`, '#ffd34d');
        game.sfx('cash');
        if (st.playerGates >= gates.length) {
          const finishedRacers = race.racers.filter((c) => c.race.finished).length;
          const rank = 1 + finishedRacers;
          if (rank <= 2) return 'done';
          game.showBanner(`FINISHED P${rank}`, 'Top 2 pays — race again.');
          ms.restartCurrent();
          return undefined;
        }
      }
      // All three racers home before the player: top 2 is gone.
      if (race.racers.every((c) => c.race.finished)) {
        game.showBanner('OUTRUN', 'The pack finished — race again.');
        ms.restartCurrent();
        return undefined;
      }
      // Live position: gates passed first, then distance to the next gate.
      const pg = st.playerGates;
      const pn = gates[Math.min(pg, gates.length - 1)];
      const pDist = dTo(game, pn.x, pn.y);
      let ahead = 0;
      for (const car of race.racers) {
        if (car.race.finished) {
          ahead += 1;
          continue;
        }
        const cg = gates[car.race.gates];
        const cDist = Math.hypot(car.x - cg.x, car.y - cg.y);
        if (car.race.gates > pg || (car.race.gates === pg && cDist < pDist)) ahead += 1;
      }
      ms.setObjective(`Gate ${Math.min(pg + 1, 5)}/5 — P${ahead + 1}`, { x: pn.x, y: pn.y });
      return undefined;
    },
    onEnd(game) {
      // Tow the race cars away and clear the gates, however the race ended.
      game.cars = game.cars.filter((c) => c.role !== 'racer');
      game.race = null;
    },
  },

  'payback-pier': {
    id: 'payback-pier',
    title: 'Payback at the Pier',
    brief: 'Four Harbor Kings on the pier deck. Two waves — send them all swimming.',
    reward: 800,
    next: 'the-getaway',
    start(game, ms) {
      const st = ms.current.state;
      st.kills = 0;
      st.wave = 1;
      spawnMissionKing(game, 3480, 1780, 'payback-pier');
      spawnMissionKing(game, 3520, 1820, 'payback-pier');
      ms.setObjective('Clear the pier — 4 Harbor Kings (wave 1/2)', { x: lm(game, 'pier').cx, y: lm(game, 'pier').cy });
    },
    onEnemyDown(game, ms, enemy) {
      if (enemy.mission !== 'payback-pier') return;
      const st = ms.current.state;
      st.kills += 1;
      if (st.kills === 2 && st.wave === 1) {
        st.wave = 2;
        spawnMissionKing(game, 3460, 1820, 'payback-pier');
        spawnMissionKing(game, 3540, 1780, 'payback-pier');
        game.showBanner('REINFORCEMENTS', 'Two more Kings on the pier');
        ms.setObjective('Clear the pier — 2 Kings left (wave 2/2)', { x: lm(game, 'pier').cx, y: lm(game, 'pier').cy });
      }
    },
    update(game, ms) {
      if (ms.current.state.kills >= 4) return 'done';
      return undefined;
    },
    onEnd(game) {
      removeTaggedEnemies(game, 'payback-pier');
    },
  },

  'the-getaway': {
    id: 'the-getaway',
    title: 'The Getaway',
    brief: 'The job went loud — three stars and roadblocks. Lose all the heat.',
    reward: 700,
    next: 'solmar-score',
    start(game, ms) {
      game.police.setWanted(3);
      game.showBanner('THE JOB WENT LOUD', '3 stars — lose the heat');
      ms.setObjective('Escape — lose ALL the heat (0 stars)', { x: lm(game, 'spa').cx, y: lm(game, 'spa').cy });
    },
    update(game) {
      if (game.wanted === 0) return 'done';
      return undefined;
    },
  },

  'solmar-score': {
    id: 'solmar-score',
    title: 'The Solmar Score',
    brief: 'Crack the vault at Solmar Bay Bank — then lose the heat the alarm brings.',
    reward: 1500,
    next: 'harbor-war',
    start(game, ms) {
      // Normalize first: stray heat or stray kings must never stack on the
      // alarm's +2.
      game.police.clearWanted();
      game.enemies = game.enemies.filter((e) => e.kind !== 'king');
      const st = ms.current.state;
      st.phase = 'channel';
      st.progress = 0;
      ms.setObjective('Crack the vault — stay at the bank (5s)', { x: lm(game, 'bank').cx, y: lm(game, 'bank').cy });
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const bank = lm(game, 'bank');
      if (st.phase === 'channel') {
        if (dTo(game, bank.cx, bank.cy) < 200) {
          st.progress += dt;
          const pct = Math.min(100, Math.floor((st.progress / 5) * 100));
          ms.setObjective(`Cracking the vault… ${pct}%`, { x: bank.cx, y: bank.cy });
          if (st.progress >= 5) {
            st.phase = 'escape';
            game.police.addWanted(2);
            game.showBanner('ALARM!', 'The vault is open — lose the heat');
            ms.setObjective('Escape — lose ALL the heat (0 stars)', { x: lm(game, 'spa').cx, y: lm(game, 'spa').cy });
          }
        } else {
          // Stepping away resets the channel.
          st.progress = 0;
          ms.setObjective('Crack the vault — stay at the bank (5s)', { x: bank.cx, y: bank.cy });
        }
        return undefined;
      }
      if (game.wanted === 0) return 'done';
      return undefined;
    },
  },

  'harbor-war': {
    id: 'harbor-war',
    title: 'Harbor War',
    brief: 'The finale. Storm the Harbor Kings HQ — six Kings and their boss.',
    reward: 2000,
    next: null,
    start(game, ms) {
      const st = ms.current.state;
      st.kills = 0;
      st.total = 7;
      const hq = lm(game, 'ganghq');
      const spots = [
        [2680, 2850], [3020, 2850], [2850, 3020],
        [2700, 2700], [3000, 3000], [2700, 3000],
      ];
      for (const [x, y] of spots) spawnMissionKing(game, x, y, 'harbor-war');
      // The boss: 3x HP, distinct colour, holds the HQ centre.
      const boss = spawnMissionKing(game, hq.cx, hq.cy - 150, 'harbor-war');
      boss.hp = 240;
      boss.maxHp = 240;
      boss.boss = true;
      boss.color = '#e74c3c';
      boss.damage = 12;
      game.showBanner('THE HARBOR WAR', 'Take the HQ — the Kings end tonight');
      ms.setObjective('Storm the HQ — 7 Harbor Kings left', { x: hq.cx, y: hq.cy });
    },
    onEnemyDown(game, ms, enemy) {
      if (enemy.mission !== 'harbor-war') return;
      const st = ms.current.state;
      st.kills += 1;
      const left = st.total - st.kills;
      ms.setObjective(left > 0 ? `Storm the HQ — ${left} Harbor Kings left` : 'Storm the HQ', { x: lm(game, 'ganghq').cx, y: lm(game, 'ganghq').cy });
    },
    update(game, ms) {
      if (ms.current.state.kills >= ms.current.state.total) return 'done';
      return undefined;
    },
    onEnd(game) {
      removeTaggedEnemies(game, 'harbor-war');
    },
  },

  'free-roam': {
    id: 'free-roam',
    title: 'Free Roam',
    brief: 'Solmar Bay is yours. Start by visiting the Pier.',
    reward: 0,
    next: null,
    start(game, ms) {
      ms.setObjective('Visit Solmar Pier — the east end of the beach', { x: game.city.landmarkById.pier.cx, y: game.city.landmarkById.pier.cy });
    },
    update(game, ms) {
      const pier = game.city.landmarkById.pier;
      if (!ms.pierPaid && Math.hypot(game.player.x - pier.cx, game.player.y - pier.cy) < 130) {
        ms.pierPaid = true;
        game.player.cash += 50;
        game.effects.floater(game.player.x, game.player.y - 30, '+$50', '#7CFC00');
        game.sfx('cash');
        ms.setObjective('Free roam — explore Solmar Bay, find work, stay out of trouble', null);
      }
      return undefined; // free roam never completes
    },
  },
};

/**
 * Vera's gold sports car. Spawns parked on the road south of the garage;
 * matches by model + colour so CONTINUE never duplicates a car the player
 * already saved while driving.
 */
export function ensureGoldCar(game) {
  const exists = game.cars.some((c) => c.model === 'sports' && c.color === GOLD_CAR_COLOR);
  if (exists) return null;
  const car = createCar(game, 'sports', GOLD_CAR_SPOT.x, GOLD_CAR_SPOT.y, 0, 'parked');
  car.color = GOLD_CAR_COLOR;
  return car;
}

export function createMissions(game) {
  // Live closure state — the getters below read THIS, never a snapshot.
  const state = {
    currentId: null,
    current: null, // { def, state }
    completed: new Set(),
    pierPaid: false,
    stashesTaken: new Set(),
    goldCarEarned: false,
  };

  function list() {
    return Object.values(MISSION_DEFS);
  }

  function isComplete(id) {
    return state.completed.has(id);
  }

  function setObjective(text, marker) {
    game.objective = { title: state.current ? state.current.def.title : 'Free Roam', text };
    game.missionMarker = marker ? { x: marker.x, y: marker.y } : null;
  }

  function start(id) {
    const def = MISSION_DEFS[id];
    if (!def) return false;
    state.currentId = id;
    state.current = { def, state: {} };
    const ms = api;
    def.start(game, ms);
    return true;
  }

  function endDef(def) {
    if (def && def.onEnd) {
      try {
        def.onEnd(game, api);
      } catch {
        // cleanup must never break the mission flow
      }
    }
  }

  function applyRespectPerks() {
    // Feared (6 missions): +25 max HP, applied once, the moment it is earned.
    if (state.completed.size === 6 && game.player.maxHp < 125) {
      game.player.maxHp = 125;
      game.player.hp = 125;
      game.effects.floater(game.player.x, game.player.y - 50, 'MAX HEALTH +25 (FEARED)', '#ffd34d');
    }
  }

  function completeCurrent() {
    const cur = state.current;
    if (!cur) return;
    const def = cur.def;
    endDef(def);
    // Clear state FIRST, then pay / banner / autosave / chain — so a chained
    // start() never sees the old mission's state.
    state.current = null;
    state.currentId = null;
    state.completed.add(def.id);
    applyRespectPerks();
    if (def.reward > 0) {
      game.player.cash += def.reward;
      game.effects.floater(game.player.x, game.player.y - 30, `+$${def.reward}`, '#7CFC00');
      game.sfx('cash');
    }
    game.showBanner('MISSION PASSED', def.title);
    if (def.next) start(def.next);
    else if (def.id !== 'free-roam') start('free-roam');
    // Save AFTER the chain starts: saveNow before start() recorded
    // currentId null (state was cleared above), so CONTINUE after any
    // mission completion dropped the player into free-roam with no mission.
    game.saveNow();
  }

  function failCurrent(reason) {
    const cur = state.current;
    if (!cur) return;
    endDef(cur.def);
    state.current = null;
    state.currentId = null;
    game.showBanner('MISSION FAILED', reason || cur.def.title);
  }

  function restartCurrent() {
    const id = state.currentId;
    if (!id) return;
    endDef(state.current ? state.current.def : null);
    state.current = null;
    state.currentId = null;
    start(id);
  }

  function onEnemyDown(enemy) {
    const cur = state.current;
    if (cur && cur.def.onEnemyDown) cur.def.onEnemyDown(game, api, enemy);
  }

  // Cash stashes live in every mission + free roam: proximity pickup,
  // pay-once, persisted. Checked here, not in any single def.
  function checkStashes() {
    const p = game.player;
    for (let i = 0; i < STASHES.length; i++) {
      if (state.stashesTaken.has(i)) continue;
      const s = STASHES[i];
      if (Math.hypot(p.x - s.x, p.y - s.y) < 60) {
        state.stashesTaken.add(i);
        game.player.cash += STASH_REWARD;
        game.effects.floater(p.x, p.y - 30, `+$${STASH_REWARD} CASH STASH`, '#7CFC00');
        game.sfx('cash');
        game.saveNow();
      }
    }
  }

  function update(dt) {
    checkStashes();
    const cur = state.current;
    if (!cur) return;
    const result = cur.def.update ? cur.def.update(game, api, dt) : undefined;
    if (result === 'done') completeCurrent();
    else if (result === 'failed') failCurrent();
  }

  function serialize() {
    return {
      currentId: state.currentId,
      completed: [...state.completed],
      pierPaid: state.pierPaid,
      stashesTaken: [...state.stashesTaken],
      goldCarEarned: state.goldCarEarned,
    };
  }

  function restore(data) {
    if (!data) return;
    state.completed = new Set(data.completed || []);
    state.pierPaid = !!data.pierPaid;
    state.stashesTaken = new Set(data.stashesTaken || []);
    state.goldCarEarned = !!data.goldCarEarned;
    if (state.completed.size >= 6 && game.player.maxHp < 125) {
      game.player.maxHp = 125;
    }
    if (data.currentId && MISSION_DEFS[data.currentId]) start(data.currentId);
  }

  const api = {
    start,
    completeCurrent,
    failCurrent,
    restartCurrent,
    setObjective,
    onEnemyDown,
    update,
    list,
    isComplete,
    serialize,
    restore,
    stashList() {
      return STASHES.map((s, i) => ({ ...s, taken: state.stashesTaken.has(i) }));
    },
    get current() {
      return state.current;
    },
    get currentId() {
      return state.currentId;
    },
    get pierPaid() {
      return state.pierPaid;
    },
    set pierPaid(v) {
      state.pierPaid = v;
    },
    get respect() {
      return state.completed.size;
    },
    get respectRank() {
      return respectRankName(state.completed.size);
    },
    get goldCarEarned() {
      return state.goldCarEarned;
    },
    set goldCarEarned(v) {
      state.goldCarEarned = v;
    },
    get completedCount() {
      return state.completed.size;
    },
  };
  return api;
}
