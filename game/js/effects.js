// SOLMAR effects: particles, tracers, floating text, tyre skids, screen shake.
// Two draw passes: drawSkids goes UNDER the actors, draw goes ON TOP — skids
// drawn on top of cars look like the car is driving under its own tyre marks.

export function createEffects() {
  const fx = {
    particles: [],
    tracers: [],
    floaters: [],
    skids: [],
    shake: 0,

    burst(x, y, color, n = 12, speed = 160) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, max: 0.8, color, size: 2 + Math.random() * 3 });
      }
    },
    sparks(x, y) {
      fx.burst(x, y, '#ffd34d', 10, 220);
    },
    smoke(x, y) {
      for (let i = 0; i < 4; i++) {
        fx.particles.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 0.8 + Math.random() * 0.5, max: 1.3, color: '#8a8a8a', size: 5 + Math.random() * 5 });
      }
    },
    blood(x, y) {
      fx.burst(x, y, '#c0392b', 8, 120);
    },
    tracer(x1, y1, x2, y2) {
      fx.tracers.push({ x1, y1, x2, y2, life: 0.08 });
    },
    floater(x, y, text, color = '#ffffff') {
      fx.floaters.push({ x, y, text, color, life: 1.2 });
    },
    skid(x, y, angle) {
      fx.skids.push({ x, y, angle, life: 6 });
      if (fx.skids.length > 400) fx.skids.splice(0, fx.skids.length - 400);
    },
    muzzle(x, y, angle) {
      fx.particles.push({ x: x + Math.cos(angle) * 14, y: y + Math.sin(angle) * 14, vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 60, life: 0.06, max: 0.06, color: '#ffe066', size: 5 });
    },
    addShake(amount) {
      fx.shake = Math.min(14, fx.shake + amount);
    },

    updateEffects(dt) {
      fx.shake = Math.max(0, fx.shake - dt * 30);
      for (const p of fx.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2 * dt;
        p.vy *= 1 - 2 * dt;
      }
      fx.particles = fx.particles.filter((p) => p.life > 0);
      for (const t of fx.tracers) t.life -= dt;
      fx.tracers = fx.tracers.filter((t) => t.life > 0);
      for (const f of fx.floaters) {
        f.life -= dt;
        f.y -= 28 * dt;
      }
      fx.floaters = fx.floaters.filter((f) => f.life > 0);
      for (const s of fx.skids) s.life -= dt;
      fx.skids = fx.skids.filter((s) => s.life > 0);
    },

    drawSkids(ctx) {
      ctx.save();
      for (const s of fx.skids) {
        ctx.globalAlpha = Math.min(0.5, s.life / 6);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(s.x - Math.cos(s.angle) * 8, s.y - Math.sin(s.angle) * 8);
        ctx.lineTo(s.x + Math.cos(s.angle) * 8, s.y + Math.sin(s.angle) * 8);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawEffects(ctx) {
      ctx.save();
      for (const t of fx.tracers) {
        ctx.globalAlpha = Math.min(1, t.life / 0.08);
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      for (const p of fx.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px Arial, sans-serif';
      for (const f of fx.floaters) {
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.fillStyle = f.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    },
  };
  return fx;
}
