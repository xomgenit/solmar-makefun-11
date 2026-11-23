// SOLMAR missions: the registry + the mission runner. Builder 2 adds the
// story chain here — the shape is fixed, so story defs only need to fill it.
//
// Def shape:
//   { id, title, brief, reward, next,
//     start(game, ms),                       // set the first objective
//     update(game, ms, dt) -> 'done'|'failed'|undefined,
//     onEnemyDown(game, ms, enemy) }          // optional
//
// Per-mission state lives in ms.current.state (a fresh {} per start).
// Persistent flags (like pierPaid) live in the missions closure, NOT in
// per-start state — a restart must never re-pay a one-time reward.

export const MISSION_DEFS = {
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

export function createMissions(game) {
  // Live closure state — the getters below read THIS, never a snapshot.
  const state = {
    currentId: null,
    current: null, // { def, state }
    completed: new Set(),
    pierPaid: false,
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

  function completeCurrent() {
    const cur = state.current;
    if (!cur) return;
    const def = cur.def;
    // Clear state FIRST, then pay / banner / autosave / chain — so a chained
    // start() never sees the old mission's state.
    state.current = null;
    state.currentId = null;
    state.completed.add(def.id);
    if (def.reward > 0) {
      game.player.cash += def.reward;
      game.effects.floater(game.player.x, game.player.y - 30, `+$${def.reward}`, '#7CFC00');
      game.sfx('cash');
    }
    game.showBanner('MISSION PASSED', def.title);
    game.saveNow();
    if (def.next) start(def.next);
    else if (def.id !== 'free-roam') start('free-roam');
  }

  function failCurrent(reason) {
    const cur = state.current;
    if (!cur) return;
    state.current = null;
    state.currentId = null;
    game.showBanner('MISSION FAILED', reason || cur.def.title);
  }

  function restartCurrent() {
    const id = state.currentId;
    if (!id) return;
    state.current = null;
    state.currentId = null;
    start(id);
  }

  function onEnemyDown(enemy) {
    const cur = state.current;
    if (cur && cur.def.onEnemyDown) cur.def.onEnemyDown(game, api, enemy);
  }

  function update(dt) {
    const cur = state.current;
    if (!cur) return;
    const result = cur.def.update ? cur.def.update(game, api, dt) : undefined;
    if (result === 'done') completeCurrent();
    else if (result === 'failed') failCurrent();
  }

  function serialize() {
    return { currentId: state.currentId, completed: [...state.completed], pierPaid: state.pierPaid };
  }

  function restore(data) {
    if (!data) return;
    state.completed = new Set(data.completed || []);
    state.pierPaid = !!data.pierPaid;
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
  };
  return api;
}
