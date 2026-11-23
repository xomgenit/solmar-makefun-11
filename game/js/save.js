// SOLMAR saves: one localStorage slot, `solmar-save-v1`. The city seed is
// stored, so CONTINUE rebuilds the SAME city the player left — buildings,
// palms and all.

export const SAVE_KEY = 'solmar-save-v1';

export function saveGame(game) {
  try {
    const data = {
      version: 1,
      seed: game.seed,
      cash: game.player.cash,
      hp: game.player.hp,
      maxHp: game.player.maxHp || 100,
      x: game.player.x,
      y: game.player.y,
      weapon: game.player.weapon,
      upgrades: game.player.upgrades || {},
      missions: game.missions ? game.missions.serialize() : null,
      station: game.radioStation || 0,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1 || typeof data.seed !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
