// SOLMAR render: draws the world through the camera. THE CAMERA RULE: every
// frame, drawWorld does ctx.save(); ctx.translate(-cam.x, -cam.y); FIRST and
// ctx.restore(); LAST. An earlier build computed the camera and never applied
// it, so the canvas always showed the map's top-left corner and the player was
// invisible. The play-test pixel-checks this: teleport far from the origin and
// the player colour must appear at screen centre.

import { WORLD, BEACH_X, SEA_X, PIER, ROAD_STEP, ROAD_W } from './city.js';

function drawGround(ctx, city, cam, vw, vh) {
  // Grass base.
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(cam.x - 10, cam.y - 10, vw + 20, vh + 20);
  // Sand, then sea, on the east edge.
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(BEACH_X, 0, SEA_X - BEACH_X, WORLD);
  ctx.fillStyle = '#2e7f9e';
  ctx.fillRect(SEA_X, 0, WORLD - SEA_X, WORLD);
  // Sea shimmer lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let y = 60; y < WORLD; y += 180) {
    ctx.beginPath();
    ctx.moveTo(SEA_X + 30, y);
    ctx.lineTo(SEA_X + 120, y);
    ctx.stroke();
  }
  // Roads: asphalt bands with centre dashes.
  ctx.fillStyle = '#3d3d3d';
  for (let i = 0; i <= 12; i++) {
    const c = i * ROAD_STEP;
    ctx.fillRect(c - ROAD_W / 2, 0, ROAD_W, WORLD);
    ctx.fillRect(0, c - ROAD_W / 2, WORLD, ROAD_W);
  }
  ctx.strokeStyle = '#f5d76e';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (let i = 0; i <= 12; i++) {
    const c = i * ROAD_STEP;
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, WORLD);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, c);
    ctx.lineTo(WORLD, c);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Sidewalk blocks: light pavement squares between the roads.
  ctx.fillStyle = '#9aa08a';
  for (let bi = 0; bi < 12; bi++) {
    for (let bj = 0; bj < 12; bj++) {
      const x = bi * ROAD_STEP + ROAD_W / 2;
      const y = bj * ROAD_STEP + ROAD_W / 2;
      if (x > BEACH_X) continue;
      ctx.fillRect(x, y, ROAD_STEP - ROAD_W, ROAD_STEP - ROAD_W);
    }
  }
}

function drawBuildings(ctx, city) {
  for (const b of city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    if (b.landmark) {
      ctx.fillStyle = '#222';
      ctx.font = 'bold 11px Arial, sans-serif';
      ctx.textAlign = 'center';
      const lm = city.landmarkById[b.landmark];
      ctx.fillText(lm.name, b.x + b.w / 2, b.y - 6);
    }
  }
  // Pier deck (walkable, over the sea).
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
  ctx.fillStyle = '#a9713a';
  for (let x = PIER.x + 8; x < PIER.x + PIER.w; x += 24) {
    ctx.fillRect(x, PIER.y + 6, 3, PIER.h - 12);
  }
  ctx.fillStyle = '#222';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Solmar Pier', PIER.x + PIER.w / 2, PIER.y - 6);
}

function drawPalms(ctx, city) {
  for (const p of city.palms) {
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + p.r);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = '#2f7d32';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(p.x + Math.cos(a) * p.r * 0.6, p.y + Math.sin(a) * p.r * 0.6, p.r * 0.8, p.r * 0.3, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
  ctx.fillStyle = car.color;
  ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);
  ctx.fillStyle = '#a8d8ea';
  ctx.fillRect(-car.w / 4, -car.h / 2 + 3, car.w / 2, car.h - 6);
  ctx.fillStyle = '#222';
  ctx.fillRect(-car.w / 2, -car.h / 2 - 2, 8, 4);
  ctx.fillRect(-car.w / 2, car.h / 2 - 2, 8, 4);
  ctx.fillRect(car.w / 2 - 8, -car.h / 2 - 2, 8, 4);
  ctx.fillRect(car.w / 2 - 8, car.h / 2 - 2, 8, 4);
  if (car.role === 'cruiser') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-6, -car.h / 2, 12, car.h);
    ctx.fillStyle = car.siren ? '#ff2222' : '#888';
    ctx.fillRect(-4, -car.h / 2 + 2, 8, 5);
    ctx.fillStyle = '#2244ff';
    ctx.fillRect(-4, car.h / 2 - 7, 8, 5);
  }
  ctx.restore();
  if (car.hp < 100) {
    ctx.fillStyle = '#222';
    ctx.fillRect(car.x - 20, car.y - car.h, 40, 5);
    ctx.fillStyle = car.hp > 40 ? '#7CFC00' : '#ff5252';
    ctx.fillRect(car.x - 19, car.y - car.h + 1, 38 * (car.hp / 100), 3);
  }
}

function drawPerson(ctx, x, y, angle, color, down) {
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.fillRect(-12, -5, 24, 10);
    ctx.restore();
    return;
  }
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHealthBar(ctx, x, y, hp, maxHp) {
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 16, y - 22, 32, 5);
  ctx.fillStyle = hp / maxHp > 0.4 ? '#7CFC00' : '#ff5252';
  ctx.fillRect(x - 15, y - 21, 30 * (hp / maxHp), 3);
}

export function drawWorld(game, ctx, cam, vw, vh) {
  ctx.save();
  // THE CAMERA: translate the world by the negative camera offset, so the
  // player stays centred. Without this line the canvas shows only the
  // top-left corner of the map.
  const sx = game.effects.shake > 0 ? (Math.random() - 0.5) * game.effects.shake : 0;
  const sy = game.effects.shake > 0 ? (Math.random() - 0.5) * game.effects.shake : 0;
  ctx.translate(-cam.x + sx, -cam.y + sy);
  drawGround(ctx, game.city, cam, vw, vh);
  drawBuildings(ctx, game.city);
  drawPalms(ctx, game.city);
  // Zone labels.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SUNSET ROW', 900, 300);
  ctx.fillText('BAYFRONT', 2700, 300);
  ctx.fillText('HARBOR DISTRICT', 900, 3300);
  ctx.fillText('KINGSIDE', 2700, 3300);
  ctx.fillText('DOWNTOWN SOLMAR', 1800, 1500);
  // Mission beacon.
  if (game.missionMarker) {
    const m = game.missionMarker;
    const pulse = 18 + Math.sin(game.time * 4) * 5;
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - 26);
    ctx.lineTo(m.x - 9, m.y - 8);
    ctx.lineTo(m.x + 9, m.y - 8);
    ctx.closePath();
    ctx.fill();
  }
  // Cash stashes: a faint green pulsing glint until collected.
  if (game.missions) {
    for (const s of game.missions.stashList()) {
      if (s.taken) continue;
      const a = 0.35 + Math.sin(game.time * 3 + s.x) * 0.2;
      ctx.fillStyle = `rgba(124,252,0,${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(124,252,0,${Math.min(1, a + 0.3).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14 + Math.sin(game.time * 3) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Street race: checkpoint gates (next gate bright, the rest dim).
  if (game.race) {
    game.race.gates.forEach((g, i) => {
      const isNext = i === game.race.playerGates;
      const done = i < game.race.playerGates;
      ctx.strokeStyle = done ? '#7CFC00' : isNext ? '#ffd34d' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isNext ? 4 : 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 130, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = done ? '#7CFC00' : isNext ? '#ffd34d' : 'rgba(255,255,255,0.7)';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(i === game.race.gates.length - 1 ? 'FIN' : `${i + 1}`, g.x, g.y + 7);
    });
  }
  // Skids UNDER the actors.
  game.effects.drawSkids(ctx);
  for (const car of game.cars) drawCar(ctx, car);
  for (const ped of game.peds) drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, ped.down);
  for (const cop of game.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1c3f6e', false);
    drawHealthBar(ctx, cop.x, cop.y, cop.hp, cop.maxHp);
  }
  for (const e of game.enemies) {
    drawPerson(ctx, e.x, e.y, e.angle, e.color || (e.kind === 'king' ? '#5b2c6f' : '#1c3f6e'), false);
    drawHealthBar(ctx, e.x, e.y, e.hp, e.maxHp);
    if (e.boss) {
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 11px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BOSS', e.x, e.y - 28);
    }
  }
  // The player: bright yellow shirt, unmistakable at screen centre.
  const p = game.player;
  if (!p.car) drawPerson(ctx, p.x, p.y, p.angle, '#ffd500', false);
  // Helicopter: shadow + spotlight cone on the ground, body above.
  if (game.heli) {
    const h = game.heli;
    ctx.fillStyle = 'rgba(255,255,200,0.18)';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(p.x - 70, p.y + 40);
    ctx.lineTo(p.x + 70, p.y + 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 90, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 30, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(h.x - 44, h.y);
    ctx.lineTo(h.x + 44, h.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AIR ONE', h.x, h.y + 4);
  }
  // Particles / tracers / floaters ON TOP.
  game.effects.drawEffects(ctx);
  ctx.restore();
}
