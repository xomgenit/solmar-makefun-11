// SOLMAR HUD: the DOM overlay (health, cash, wanted stars, objective,
// speedometer, zone, hints, banners) and the round minimap with blips.
// Element ids are part of the contract — the play-test reads them.

import { WORLD } from './city.js';
import { WEAPONS } from './combat.js';
import { currentStation } from './audio.js';

let bannerTimer = null;

export function showBanner(title, sub = '') {
  const banner = document.getElementById('banner');
  const bt = document.getElementById('banner-title');
  const bs = document.getElementById('banner-sub');
  if (!banner || !bt || !bs) return;
  bt.textContent = title;
  bs.textContent = sub;
  banner.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), 2600);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

export function updateHUD(game) {
  const p = game.player;
  const maxHp = p.maxHp || 100;
  const healthFill = document.getElementById('health-fill');
  if (healthFill) healthFill.style.width = `${Math.max(0, (p.hp / maxHp) * 100)}%`;
  setText('health-text', `${Math.ceil(p.hp)}`);
  setText('cash', `$${Math.floor(p.cash)}`);
  if (game.missions) setText('respect', `Respect: ${game.missions.respectRank} (${game.missions.respect}/8)`);
  const stars = document.getElementById('stars');
  if (stars) {
    const filled = '★'.repeat(game.wanted);
    const empty = '☆'.repeat(5 - game.wanted);
    const text = filled + empty;
    if (stars.textContent !== text) stars.textContent = text;
    stars.classList.toggle('hot', game.wanted > 0);
  }
  setText('zone', game.zoneName || '');
  setText('objective-title', game.objective ? game.objective.title : 'Free Roam');
  setText('objective-text', game.objective ? game.objective.text : '');
  setText('weapon', WEAPONS[p.weapon] ? WEAPONS[p.weapon].name : p.weapon);
  setText('radio', currentStation());
  const speedo = document.getElementById('speedometer');
  const car = p.car;
  if (speedo) speedo.style.display = car ? 'block' : 'none';
  if (car) {
    setText('speed', `${Math.round(car.speed * 0.36)}`);
    const ch = document.getElementById('car-health');
    if (ch) ch.style.width = `${Math.max(0, car.hp)}%`;
  }
  setText('hint', game.hint || '');
  drawMinimap(game);
}

function drawMinimap(game) {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / WORLD;
  ctx.clearRect(0, 0, size, size);
  // Clip to the round frame.
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2d5a3d';
  ctx.fillRect(0, 0, size, size);
  // Sea.
  ctx.fillStyle = '#2e7f9e';
  ctx.fillRect(3420 * scale, 0, size, size);
  // Roads.
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 12; i++) {
    const p = i * 300 * scale;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  const blip = (x, y, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * scale, y * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (game.missionMarker) blip(game.missionMarker.x, game.missionMarker.y, '#ffd34d', 5);
  for (const car of game.cars) {
    if (car.role === 'cruiser') blip(car.x, car.y, '#3b82f6', 3);
  }
  for (const cop of game.cops) blip(cop.x, cop.y, '#60a5fa', 2);
  if (game.heli) blip(game.heli.x, game.heli.y, '#f97316', 4);
  for (const e of game.enemies) blip(e.x, e.y, '#ef4444', 3);
  // Player last, on top.
  blip(game.player.x, game.player.y, '#ffffff', 4);
  ctx.restore();
}
