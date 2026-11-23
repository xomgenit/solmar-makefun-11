// SOLMAR — Streets of the Sun: the gta6-01 hand-in program (Node 22, stdlib only).
//
// The game lives in game/ as plain static files (index.html + ES modules, no
// library, no network request) and screenshots/ holds 3-4 real renders of it.
// This program copies both into the output directory and writes dossier.json
// with the kit's own buildDossier, so the dossier the judge reads is exactly
// what the scorer rebuilds. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//
//   MAKEFUN_OUTPUT_DIR=/tmp/pw11/out node main.ts
//
// Preflight first: fail loudly (and early) when the tree is not hand-in ready,
// so a broken entry never ships a half-written /output.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, from the kit's reference/gate.json. Only
// text_max_bytes shapes the dossier's bytes; the rest make this program refuse
// an entry the scorer would refuse, at build time instead of at grading time.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function preflight(): void {
  const gameDir = join(REPO, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing — nothing to hand in');
  const shotsDir = join(REPO, 'screenshots');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing — the entry needs 3 or 4 screenshots');
  const shots = readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name) && !name.startsWith('.'));
  if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image(s) — the entry needs 3 or 4`);
  if (shots.length > CAPS.screenshots.max) fail(`screenshots/ holds ${shots.length} images — at most ${CAPS.screenshots.max}`);
  for (const name of shots) {
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${bytes} bytes — over the ${CAPS.screenshots.max_bytes} cap`);
  }
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function main(): void {
  preflight();
  mkdirSync(OUT, { recursive: true });
  copyTree(join(REPO, 'game'), join(OUT, 'game'));
  copyTree(join(REPO, 'screenshots'), join(OUT, 'screenshots'));
  const dossier = buildDossier(OUT, CAPS);
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  console.log(`SOLMAR handed in: game/ + ${readdirSync(join(OUT, 'screenshots')).length} screenshot(s) + dossier.json (${dossier.length} bytes) -> ${OUT}`);
}

main();
