// main.js — the boot module of Solar Bay. It sizes the canvas, builds the
// world, runs the fixed-step loop, switches between the title, playing,
// paused, busted and wasted screens, and (behind ?shot=<scene>) stages the
// screenshot scenes instead of playing. Everything else lives in the modules
// it wires together: city, entities, missions, world, render, audio, input.
import { STEP } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import {
  SCREEN_BUSTED, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
  drawHud, drawOverlay, drawTitleScreen, drawWorld, titleMenuRects,
} from './render.js';
import { stageShot } from './shots.js';
import { applyBusted, applySave, applyWasted, createWorld, loadSave, saveGame, stepWorld } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const shotName = params.get('shot');

const audio = createAudio();
const input = createInput(canvas);

let view = { w: 1280, h: 800 };
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  view = { w: window.innerWidth, h: window.innerHeight };
  canvas.width = Math.round(view.w * dpr);
  canvas.height = Math.round(view.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// The first gesture unlocks WebAudio; from then on the city has sound.
const unlock = () => audio.ensure();
window.addEventListener('keydown', unlock, { once: true });
window.addEventListener('mousedown', unlock, { once: true });

let world = createWorld(seed, audio);
world.step = (inp, dt) => stepWorld(world, inp, dt);
let screen = SCREEN_TITLE;
let menuIndex = 0;
let showHelp = false;
let lastCam = { x: 0, y: 0 };
let lastObjectiveLabel = '';

const IDLE_INPUT = {
  mouse: { x: 0, y: 0, down: false },
  down: () => false,
  pressed: () => false,
  takeClick: () => false,
  axes: () => ({ x: 0, y: 0 }),
};

function menuItems() {
  const items = [{ label: 'New Game', action: 'new' }];
  if (loadSave()) items.push({ label: 'Continue', action: 'continue' });
  items.push({ label: 'How to Play', action: 'help' });
  return items;
}

function startGame(continueSave) {
  const save = continueSave ? loadSave() : null;
  world = createWorld(seed, audio);
  world.step = (inp, dt) => stepWorld(world, inp, dt);
  if (save) applySave(world, save);
  screen = SCREEN_PLAY;
  audio.ensure();
  audio.ui();
}

function chooseMenuItem() {
  const item = menuItems()[menuIndex];
  if (!item) return;
  if (item.action === 'new') startGame(false);
  else if (item.action === 'continue') startGame(true);
  else if (item.action === 'help') showHelp = !showHelp;
}

function handleTitleInput() {
  const items = menuItems();
  if (input.pressed('ArrowDown') || input.pressed('KeyS')) {
    menuIndex = (menuIndex + 1) % items.length;
    audio.ui();
  }
  if (input.pressed('ArrowUp') || input.pressed('KeyW')) {
    menuIndex = (menuIndex - 1 + items.length) % items.length;
    audio.ui();
  }
  if (input.pressed('Enter') || input.pressed('Space')) chooseMenuItem();
  if (input.takeClick()) {
    const rects = titleMenuRects(view, items.length);
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h) {
        menuIndex = i;
        chooseMenuItem();
        break;
      }
    }
  }
}

function handlePlayInput() {
  if (input.pressed('KeyP') || input.pressed('Escape')) {
    screen = SCREEN_PAUSE;
    audio.ui();
    return;
  }
  if (world.gameOver === 'busted') {
    screen = SCREEN_BUSTED;
    audio.busted();
    audio.setSiren(false);
  } else if (world.gameOver === 'wasted') {
    screen = SCREEN_WASTED;
    audio.wasted();
    audio.setSiren(false);
  }
}

function handleEndInput() {
  if (input.pressed('Enter') || input.takeClick()) {
    if (screen === SCREEN_BUSTED) applyBusted(world);
    else applyWasted(world);
    world.gameOver = null;
    screen = SCREEN_PLAY;
  }
}

// Screenshot staging: build the scene once, then hold it for the camera.
let shotStage = null;
if (shotName) {
  shotStage = stageShot(shotName, world);
  screen = shotStage.screen;
}

let previous = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - previous) / 1000;
  previous = now;
  if (dt > 0.1) dt = 0.1;
  accumulator += dt;

  world.view = view;
  world.mouseWorld = { x: lastCam.x + input.mouse.x, y: lastCam.y + input.mouse.y };
  world.mouseDown = input.mouse.down;

  if (shotStage) {
    const drawn = drawWorld(ctx, world, view, shotStage.cam);
    lastCam = { x: drawn.camX, y: drawn.camY };
    if (screen === SCREEN_PLAY) drawHud(ctx, world, view);
    if (screen === SCREEN_TITLE) drawTitleScreen(ctx, world, view, menuItems(), menuIndex, showHelp);
    window.__solarBayReady = true;
    return;
  }

  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (screen === SCREEN_PLAY) {
      world.step(input, STEP);
      handlePlayInput();
    } else if (screen === SCREEN_TITLE) {
      world.step(IDLE_INPUT, STEP); // the city lives behind the title
      handleTitleInput();
    } else if (screen === SCREEN_PAUSE) {
      if (input.pressed('KeyP') || input.pressed('Escape') || input.pressed('Enter')) screen = SCREEN_PLAY;
      if (input.pressed('KeyS')) {
        saveGame(world);
        world.showBanner('Game saved', 'Progress written to this browser');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      handleEndInput();
    }
  }

  const drawn = drawWorld(ctx, world, view, null);
  lastCam = { x: drawn.camX, y: drawn.camY };
  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSE) drawHud(ctx, world, view);
  if (screen === SCREEN_PAUSE) {
    drawOverlay(ctx, view, 'PAUSED', [
      'Enter — back to the bay',
      'S — save game',
      `Missions done: ${world.stats.missionsDone} · Courier jobs: ${world.stats.courierJobs} · Cars taken: ${world.stats.carsStolen}`,
    ]);
  }
  if (screen === SCREEN_TITLE) drawTitleScreen(ctx, world, view, menuItems(), menuIndex, showHelp);
  if (screen === SCREEN_BUSTED) {
    drawOverlay(ctx, view, 'BUSTED', ['The SBPD kept 15% of your cash as a fine.', 'Press Enter to walk out of the station.'], '#ff5040');
  }
  if (screen === SCREEN_WASTED) {
    drawOverlay(ctx, view, 'WASTED', ['St. Alba patched you up for 10% of your cash.', 'Press Enter to walk out of the hospital.'], '#f87171');
  }

  const label = world.objective ? world.objective.label : '';
  if (label !== lastObjectiveLabel) {
    lastObjectiveLabel = label;
    if (statusEl) statusEl.textContent = label;
  }
  window.__solarBayReady = true;
}
requestAnimationFrame(frame);
