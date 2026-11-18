// shots.js — the staged scenes behind ?shot=start|drive|chase|mission, used
// to take the entry's screenshots. Each scene is built from the real world
// and the real rules: the drive and chase scenes run the simulation forward
// with the player's car held at cruising speed, the mission scene starts the
// actual second story mission, and the start scene is the title screen over
// the marina at golden hour. Same seed, same scene, every time.
import { WORLD_H } from './config.js';
import { LANE_FAR, roadTop } from './city.js';
import { makeCopCar, makeTrafficCar } from './entities.js';
import { MISSIONS, startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { STEP } from './config.js';
import { makeRng } from './random.js';

/** An input with nothing held and nothing pressed, for staging steps. */
const IDLE_INPUT = {
  mouse: { x: 0, y: 0, down: false },
  down: () => false,
  pressed: () => false,
  takeClick: () => false,
  axes: () => ({ x: 0, y: 0 }),
};

/** Put the player into a fresh car on the eastbound lane of a city avenue. */
function putPlayerInCar(world, avenueRow, x) {
  const car = makeTrafficCar(makeRng(99), null);
  car.axis = 'x';
  car.dirSign = 1;
  car.lane = roadTop(avenueRow) + LANE_FAR;
  car.x = x;
  car.y = car.lane;
  car.angle = 0;
  car.speed = 240;
  car.driver = 'player';
  car.parked = false;
  car.color = '#e4572e';
  world.player.car = car;
  world.player.x = car.x;
  world.player.y = car.y;
  world.camera.x = car.x;
  world.camera.y = car.y;
  return car;
}

/** Run the world forward, holding the player's car at cruising speed. */
function cruise(world, seconds, speed) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(IDLE_INPUT, STEP);
    if (world.player.car) {
      world.player.car.speed = Math.max(world.player.car.speed, speed);
      world.player.car.angle = 0;
    }
  }
}

/**
 * Set the wanted level to an exact star count for a composed scene: staging
 * a drive can rack up accidental heat (a clipped bumper, a scared witness),
 * so scenes that need a specific level set it directly at the end.
 */
function composeWanted(world, stars) {
  world.wanted.heat = stars;
  world.setWanted(stars); // re-syncs the star count from the heat
  world.bustT = 0;
}

/**
 * Stage the named scene in `world` (which the boot module built fresh) and
 * return the screen to draw and, for the title, a camera to draw from.
 * The world module is passed in to avoid a module cycle: world.step is
 * stepWorld from world.js, attached by main.js before staging.
 */
export function stageShot(name, world) {
  if (name === 'drive') {
    putPlayerInCar(world, 6, 520);
    cruise(world, 1.6, 215);
    composeWanted(world, 0); // a calm cruise: no stars in this scene
    cruise(world, 0.3, 215);
    return { screen: SCREEN_PLAY, cam: null };
  }
  if (name === 'chase') {
    const car = putPlayerInCar(world, 3, 900);
    world.setWanted(3);
    cruise(world, 0.8, 250);
    // Compose the pursuit inside the frame: three cars close behind her.
    const gaps = [170, 260, 345];
    gaps.forEach((gap, i) => {
      const cop = makeCopCar(world.rng, car.x - gap, car.y + (i - 1) * 44);
      cop.angle = 0;
      cop.speed = 265;
      world.cops.push(cop);
    });
    cruise(world, 0.45, 250);
    composeWanted(world, 3);
    return { screen: SCREEN_PLAY, cam: null };
  }
  if (name === 'mission') {
    world.story.next = 1; // Package Run, the second chapter
    startMission(world, world.story, MISSIONS[1]);
    const door = world.city.specials.marina.door;
    world.player.x = door.x - 96;
    world.player.y = door.y - 16;
    world.player.angle = Math.atan2(door.y - world.player.y, door.x - world.player.x);
    world.camera.x = world.player.x + 40;
    world.camera.y = world.player.y - 30;
    for (let i = 0; i < 30; i += 1) world.step(IDLE_INPUT, STEP);
    return { screen: SCREEN_PLAY, cam: null };
  }
  // 'start' and anything else: the title over the marina, late afternoon.
  const marina = world.city.specials.marina.door;
  return {
    screen: SCREEN_TITLE,
    cam: { x: marina.x + 120, y: WORLD_H - 330 },
  };
}
