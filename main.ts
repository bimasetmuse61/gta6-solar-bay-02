// Solar Bay — entry program for make.fun competition gta6-01 ("Make GTA 6").
// Node 22, standard library only. The game itself is the static site under game/
// (open game/index.html in a browser and play; it loads nothing from the network).
// This program's only job is the hand-in: copy game/ and screenshots/ into the
// output directory and write dossier.json there with the vendored make.fun
// library, byte for byte the way the scorer rebuilds it.
//
// Run it locally the same way the grader does, with another directory standing
// in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game for play-testing with:  node serve.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game tree goes over whole: the scorer reads /output/game exactly as the
// browser would serve it, so nothing is filtered or rewritten on the way.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots are the judge's cover and contact sheet; copy them as they are.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below are the scorer's own (see the kit's gate description): the
// dossier text is capped, screenshots are at most 4 files of 256 KiB, game/
// holds at most 993 entries and 48 MiB, and no path under game/ runs past
// 1,000 UTF-8 bytes. buildDossier refuses anything the scorer would refuse.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);
