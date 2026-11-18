// world.js — the simulation core of Solar Bay. It owns the state (player,
// vehicles, pedestrians, police, particles, wanted level, story progress),
// advances it in fixed steps, and applies the rules: driving and walking,
// entering and stealing cars, gunfire, police pressure, being busted or
// wasted, and saving the game to localStorage. Rendering lives in render.js;
// missions live in missions.js; this file is the referee between them.
import { CAR_TYPES, GUN, MAX_STARS, PLAYER, STAR_DECAY_SECONDS, WORLD_H, WORLD_W } from './config.js';
import { buildCity, collideCircle, lineOfSight, blockRect, randomRoadPoint } from './city.js';
import { makeCopCar, makeParkedCar, makePed, makeTrafficCar, scarePeds, stepCopCar, stepPed, stepTrafficCar } from './entities.js';
import { createStory, updateMissions } from './missions.js';
import { angleDelta, clamp, dist, makeRng, randInt, randRange } from './random.js';

export const SAVE_KEY = 'solarBaySaveV1';

const TRAFFIC_TARGET = 24;
const PED_TARGET = 30;
const COP_DESPAWN = 1150;

/** A fresh world: city built, player standing by the marina, story at page one. */
export function createWorld(seed = 1, audio = null) {
  const rng = makeRng(seed * 7919 + 13);
  const city = buildCity(rng);
  const spawn = city.specials.marina.door;
  const world = {
    rng,
    city,
    audio,
    seed,
    elapsed: 0,
    timeOfDay: 16.4, // late golden afternoon
    player: {
      x: spawn.x - 26, y: spawn.y + 30, angle: -Math.PI / 2,
      hp: PLAYER.maxHealth, cash: 120, car: null, fireT: 0, speedNow: 0,
    },
    cars: [],
    cops: [],
    peds: [],
    particles: [],
    skids: [],
    wanted: { heat: 0, stars: 0, lastCrimeT: -99 },
    story: createStory(),
    objective: null,
    dialogue: null,
    banner: null,
    missionCar: null,
    packageAt: null,
    carryingPackage: false,
    crew: null,
    camera: { x: spawn.x, y: spawn.y },
    view: { w: 1280, h: 800 },
    mouseWorld: { x: spawn.x, y: spawn.y - 100 },
    stats: { missionsDone: 0, courierJobs: 0, carsStolen: 0, shotsFired: 0, topSpeed: 0 },
    copSpawnT: 0,
    bustT: 0,
    gameOver: null,
    endingT: 0,
    cityClear: (x1, y1, x2, y2) => lineOfSight(city, x1, y1, x2, y2),
    carTypeByKind: (kind) => CAR_TYPES.find((t) => t.kind === kind) ?? CAR_TYPES[2],
    showDialogue(lines) {
      world.dialogue = { lines, index: 0, t: 0 };
    },
    showBanner(title, sub) {
      world.banner = { title, sub, t: 0 };
    },
    setWanted(stars) {
      world.wanted.heat = Math.max(world.wanted.heat, Math.min(MAX_STARS, stars));
      world.wanted.lastCrimeT = world.elapsed;
      syncStars(world);
    },
    commitCrime(kind) {
      commitCrime(world, kind);
    },
    heatPulse(dt) {
      world.wanted.heat = Math.min(MAX_STARS, world.wanted.heat + dt * 0.04);
      syncStars(world);
    },
    saveGame() {
      saveGame(world);
    },
  };

  // Decorative parked cars along the curbs, so streets feel lived in.
  for (let i = 0; i < 30; i += 1) {
    const p = randomRoadPoint(rng);
    const vertical = Math.abs(p.x % (288 + 96)) < 96 && rng() < 0.5;
    void vertical;
    world.cars.push(makeParkedCar(rng, p.x + randRange(rng, -26, 26), p.y + randRange(rng, -26, 26),
      [0, Math.PI / 2, Math.PI, -Math.PI / 2][randInt(rng, 0, 3)]));
  }
  for (let i = 0; i < TRAFFIC_TARGET; i += 1) world.cars.push(makeTrafficCar(rng));
  for (let i = 0; i < PED_TARGET; i += 1) {
    const rect = blockRect(randInt(rng, 0, 7), randInt(rng, 0, 7));
    const ped = makePed(rng, rect);
    const poseS = ped.s;
    void poseS;
    world.peds.push(ped);
    stepPed(world, ped, 0);
  }
  return world;
}

/** Keep the integer star count in step with the fractional heat. */
function syncStars(world) {
  const heat = world.wanted.heat;
  world.wanted.stars = heat <= 0.04 ? 0 : clamp(Math.ceil(heat - 0.04), 0, MAX_STARS);
}

/** Was a crime at (x, y) seen by a pedestrian or an officer? */
function witnessed(world, x, y, radius = 270) {
  for (const ped of world.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < radius && lineOfSight(world.city, x, y, ped.x, ped.y)) return true;
  }
  for (const cop of world.cops) {
    if (!cop.dead && dist(cop.x, cop.y, x, y) < radius + 110) return true;
  }
  return false;
}

/** Add heat for a crime, by kind. Quiet crimes nobody saw may add nothing. */
export function commitCrime(world, kind) {
  const w = world.wanted;
  const px = world.player.car ? world.player.car.x : world.player.x;
  const py = world.player.car ? world.player.car.y : world.player.y;
  let add = 0;
  switch (kind) {
    case 'stealWitnessed': add = witnessed(world, px, py) ? 1 : 0.35; break;
    case 'shotsFired': add = witnessed(world, px, py, 320) ? 0.6 : 0.15; break;
    case 'runOver': add = 2; break;
    case 'hitCop': add = 1; break;
    case 'shootCop': add = 1; break;
    case 'packageHeat': add = 1; break;
    case 'hitAndRun': add = witnessed(world, px, py) ? 0.7 : 0.2; break;
    default: add = 0;
  }
  if (add > 0) {
    w.heat = Math.min(MAX_STARS, w.heat + add);
    w.lastCrimeT = world.elapsed;
    syncStars(world);
  }
}

/** Serialise the durable progress: cash, story position, where she stands. */
export function saveGame(world) {
  try {
    const data = {
      cash: world.player.cash,
      next: world.story.next,
      finished: world.story.finished,
      x: world.player.x,
      y: world.player.y,
      stats: world.stats,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* storage unavailable: the game simply does not persist */ }
}

/** Read a saved game, or null when there is none worth loading. */
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.next !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Apply a save to a fresh world (used by Continue on the title screen). */
export function applySave(world, data) {
  world.player.cash = data.cash;
  world.player.x = data.x ?? world.player.x;
  world.player.y = data.y ?? world.player.y;
  world.story.next = data.next;
  world.story.finished = Boolean(data.finished);
  if (data.stats) world.stats = { ...world.stats, ...data.stats };
}

/** Add a visual effect to the particle list (capped, oldest dropped). */
export function spawnParticle(world, particle) {
  world.particles.push(particle);
  if (world.particles.length > 420) world.particles.splice(0, world.particles.length - 420);
}

function burst(world, x, y, kind, count, color, speed = 130) {
  for (let i = 0; i < count; i += 1) {
    const a = randRange(world.rng, 0, Math.PI * 2);
    const v = randRange(world.rng, speed * 0.3, speed);
    spawnParticle(world, {
      kind, x, y, color,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: randRange(world.rng, 0.3, 0.7), size: randRange(world.rng, 2, 4.5),
    });
  }
}

/** Enter the nearest car, or get out of the current one. */
function enterExitVehicle(world, input) {
  const player = world.player;
  if (player.car) {
    const car = player.car;
    car.parked = true;
    car.driver = null;
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    collideCircle(world.city, player, PLAYER.radius);
    player.car = null;
    world.audio?.door();
    world.audio?.setEngine(null);
    world.cars.push(car);
    return;
  }
  let best = null;
  let bestD = 52;
  for (const car of world.cars) {
    if (car.dead) continue;
    const d = dist(player.x, player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  world.cars.splice(world.cars.indexOf(best), 1);
  best.parked = false;
  best.driver = 'player';
  player.car = best;
  player.x = best.x;
  player.y = best.y;
  world.audio?.door();
  if (!best.mission) {
    commitCrime(world, 'stealWitnessed');
    world.stats.carsStolen += 1;
  }
}

/** Fire the pistol toward the mouse: hitscan with a tracer and a bang. */
function fireGun(world) {
  const player = world.player;
  const fromX = player.x;
  const fromY = player.y;
  const angle = Math.atan2(world.mouseWorld.y - fromY, world.mouseWorld.x - fromX);
  player.angle = angle;
  player.fireT = GUN.fireDelay;
  world.stats.shotsFired += 1;
  world.audio?.shot();
  scarePeds(world, fromX, fromY, 230);
  commitCrime(world, 'shotsFired');

  // Find what the shot meets first: a building face, a vehicle, a person.
  let hitX = fromX + Math.cos(angle) * GUN.range;
  let hitY = fromY + Math.sin(angle) * GUN.range;
  let hitDist = GUN.range;
  for (let d = 14; d < GUN.range; d += 10) {
    const x = fromX + Math.cos(angle) * d;
    const y = fromY + Math.sin(angle) * d;
    if (!lineOfSight(world.city, fromX, fromY, x, y)) { hitDist = d; hitX = x; hitY = y; break; }
  }
  const testBody = (x, y, radius, apply) => {
    const along = (x - fromX) * Math.cos(angle) + (y - fromY) * Math.sin(angle);
    if (along < 0 || along > hitDist) return;
    const across = Math.abs((x - fromX) * Math.sin(angle) - (y - fromY) * Math.cos(angle));
    if (across < radius) {
      hitDist = along;
      hitX = x;
      hitY = y;
      apply();
    }
  };
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    testBody(ped.x, ped.y, 13, () => {
      ped.state = 'down';
      ped.deadT = 0;
      burst(world, ped.x, ped.y, 'spark', 8, '#c0392b', 90);
      commitCrime(world, 'runOver'); // shooting a person is as grave as running one down
    });
  }
  for (const car of world.cars) {
    testBody(car.x, car.y, 26, () => {
      car.hp -= GUN.damage;
      burst(world, hitX, hitY, 'spark', 6, '#f7d154', 120);
    });
  }
  for (const cop of world.cops) {
    if (cop.dead) continue;
    testBody(cop.x, cop.y, 27, () => {
      cop.hp -= GUN.damage;
      burst(world, hitX, hitY, 'spark', 7, '#f7d154', 120);
      commitCrime(world, 'shootCop');
    });
  }
  spawnParticle(world, {
    kind: 'tracer', x: fromX + Math.cos(angle) * 16, y: fromY + Math.sin(angle) * 16,
    x2: hitX, y2: hitY, t: 0, life: 0.09, color: '#ffe9a3', size: 2,
  });
  spawnParticle(world, {
    kind: 'flash', x: fromX + Math.cos(angle) * 18, y: fromY + Math.sin(angle) * 18,
    t: 0, life: 0.06, color: '#fff3b0', size: 9,
  });
}

/** Circle-vs-circle shove between two vehicles, with damage at speed. */
function collideVehicles(world, a, b, dt) {
  const minD = (a.type.length + b.type.length) * 0.36;
  const d = dist(a.x, a.y, b.x, b.y);
  if (d >= minD || d === 0) return;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  const push = (minD - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const closing = Math.abs(a.speed ?? 0) + Math.abs(b.speed ?? 0);
  if (closing > 130) {
    const dmg = (closing - 110) * 0.05;
    a.hp -= dmg;
    b.hp -= dmg;
    burst(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 7, '#f2a03d', 110);
    world.audio?.crash(Math.min(1, closing / 420));
    if (b.kind === 'cop' || a.kind === 'cop') commitCrime(world, 'hitCop');
    else if (world.player.car === a || world.player.car === b) commitCrime(world, 'hitAndRun');
  }
  if (!a.parked) a.speed *= 0.55;
  if (!b.parked) b.speed *= 0.55;
  void dt;
}

/** Drive the player's car with arcade physics. */
function stepPlayerCar(world, input, dt) {
  const player = world.player;
  const car = player.car;
  const type = car.type;
  const axes = input.axes();
  const throttle = -axes.y; // W is forward
  const steer = axes.x;
  const handbrake = input.down('Space');

  if (throttle > 0) car.speed += type.accel * dt;
  else if (throttle < 0) car.speed -= (car.speed > 4 ? 380 : type.accel * 0.55) * dt;
  const drag = handbrake ? 3.2 : 0.55;
  car.speed -= car.speed * drag * dt * (throttle === 0 ? 1.6 : 0.55);
  const wrecked = car.hp <= 0;
  const topSpeed = wrecked ? type.topSpeed * 0.25 : type.topSpeed;
  car.speed = clamp(car.speed, -topSpeed * 0.38, topSpeed);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const speedRatio = clamp(car.speed / type.topSpeed, -1, 1);
  const turnAuthority = clamp(Math.abs(car.speed) / 120, 0, 1) * (handbrake ? 1.5 : 1);
  car.angle += steer * type.grip * 0.62 * turnAuthority * dt * (car.speed < 0 ? -1 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  const probe = { x: car.x, y: car.y };
  if (collideCircle(world.city, probe, type.width * 0.95)) {
    const impact = Math.abs(car.speed);
    car.x = probe.x;
    car.y = probe.y;
    if (impact > 190) {
      car.hp -= (impact - 170) * 0.06;
      player.hp -= (impact - 190) * 0.02;
      burst(world, car.x, car.y, 'spark', 9, '#f2a03d', 140);
      world.audio?.crash(Math.min(1, impact / 460));
      scarePeds(world, car.x, car.y, 170);
    } else if (impact > 60) {
      world.audio?.crash(0.25);
    }
    car.speed *= -0.22;
  }
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speedNow = Math.abs(car.speed);
  world.stats.topSpeed = Math.max(world.stats.topSpeed, Math.abs(car.speed));
  world.audio?.setEngine(Math.abs(speedRatio));

  // Skid marks when cornering hard.
  if (Math.abs(steer) > 0 && Math.abs(car.speed) > 215) {
    world.skids.push({ x: car.x, y: car.y, angle: car.angle, t: 0 });
    if (world.skids.length > 260) world.skids.splice(0, world.skids.length - 260);
  }
  if (wrecked && world.rng() < dt * 8) {
    spawnParticle(world, {
      kind: 'smoke', x: car.x + Math.cos(car.angle) * 16, y: car.y + Math.sin(car.angle) * 16,
      vx: randRange(world.rng, -8, 8), vy: randRange(world.rng, -22, -8),
      t: 0, life: randRange(world.rng, 0.7, 1.3), size: randRange(world.rng, 5, 9), color: '#555c63',
    });
  }

  // Running someone down is the city's gravest ordinary crime.
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (Math.abs(car.speed) > 55 && dist(car.x, car.y, ped.x, ped.y) < 24) {
      ped.state = 'down';
      ped.deadT = 0;
      burst(world, ped.x, ped.y, 'spark', 8, '#c0392b', 90);
      commitCrime(world, 'runOver');
      car.speed *= 0.82;
    } else if (Math.abs(car.speed) > 160 && dist(car.x, car.y, ped.x, ped.y) < 52) {
      scarePeds(world, ped.x, ped.y, 30);
    }
  }
}

/** Walk (or run) the player on foot, with gunfire toward the mouse. */
function stepPlayerOnFoot(world, input, dt) {
  const player = world.player;
  const axes = input.axes();
  const running = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = running ? PLAYER_RUN : PLAYER_WALK;
  let mx = axes.x;
  let my = axes.y;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    player.x += mx * speed * dt;
    player.y += my * speed * dt;
    player.angle = Math.atan2(my, mx);
    player.speedNow = speed;
  } else {
    player.speedNow = 0;
  }
  collideCircle(world.city, player, PLAYER.radius);

  player.fireT = Math.max(0, player.fireT - dt);
  const aiming = input.mouse.down || input.down('Space');
  if (aiming) {
    player.angle = Math.atan2(world.mouseWorld.y - player.y, world.mouseWorld.x - player.x);
    if (player.fireT <= 0) fireGun(world);
  }

  // The hospital looks after its own doorstep.
  const hospital = world.city.specials.hospital.door;
  if (dist(player.x, player.y, hospital.x, hospital.y) < 46 && player.hp < PLAYER.maxHealth) {
    player.hp = Math.min(PLAYER.maxHealth, player.hp + 14 * dt);
  }
}

const PLAYER_WALK = 155;
const PLAYER_RUN = 245;

/** Keep traffic and pedestrians populated around the player, thin far away. */
function maintainPopulation(world) {
  const p = world.player;
  world.cars = world.cars.filter((car) => {
    if (car === world.missionCar || car.parked) return true;
    return dist(car.x, car.y, p.x, p.y) < 1350;
  });
  const moving = world.cars.filter((car) => !car.parked).length;
  if (moving < TRAFFIC_TARGET) world.cars.push(makeTrafficCar(world.rng, p));
  if (world.peds.length < PED_TARGET) {
    const rect = blockRect(randInt(world.rng, 0, 7), randInt(world.rng, 0, 7));
    world.peds.push(makePed(world.rng, rect));
  }
  world.peds = world.peds.filter((ped) => ped.state !== 'down' || ped.deadT < 24);
}

/** Spawn and retire police according to the wanted level. */
function maintainPolice(world, dt) {
  const stars = world.wanted.stars;
  const wanted = stars > 0;
  world.copSpawnT -= dt;
  const desired = wanted ? Math.min(2 + stars, 6) : 0;
  world.cops = world.cops.filter((cop) => dist(cop.x, cop.y, world.player.x, world.player.y) < COP_DESPAWN || cop.dead);
  if (world.cops.length < desired && world.copSpawnT <= 0) {
    for (let tries = 0; tries < 8; tries += 1) {
      const spot = randomRoadPoint(world.rng);
      const d = dist(spot.x, spot.y, world.player.x, world.player.y);
      if (d > 480 && d < 760) {
        world.cops.push(makeCopCar(world.rng, spot.x, spot.y));
        world.copSpawnT = 2.2;
        break;
      }
    }
    if (world.copSpawnT <= 0) world.copSpawnT = 0.8;
  }
  world.audio?.setSiren(wanted && world.cops.length > 0);
}

/** Police gunfire and the bust meter: pressure when they get close. */
function policePressure(world, dt) {
  const player = world.player;
  const stars = world.wanted.stars;
  let nearest = Infinity;
  for (const cop of world.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, player.x, player.y);
    nearest = Math.min(nearest, d);
    cop.shootT -= dt;
    if (stars >= 3 && cop.shootT <= 0 && d < 380 && lineOfSight(world.city, cop.x, cop.y, player.x, player.y)) {
      cop.shootT = randRange(world.rng, 0.8, 1.5);
      world.audio?.shot();
      spawnParticle(world, {
        kind: 'tracer', x: cop.x, y: cop.y, x2: player.x, y2: player.y,
        t: 0, life: 0.09, color: '#ffd9a3', size: 2,
      });
      const hitChance = clamp(0.62 - d / 700, 0.12, 0.6);
      if (world.rng() < hitChance) {
        if (player.car) {
          player.car.hp -= randRange(world.rng, 3, 7);
          player.hp -= randRange(world.rng, 0, 2.5);
        } else {
          player.hp -= randRange(world.rng, 3, 8);
        }
        burst(world, player.x, player.y, 'spark', 4, '#e4572e', 80);
      }
    }
  }
  if (stars === 0) {
    world.bustT = Math.max(0, world.bustT - dt * 1.4);
    return;
  }
  const slow = player.car ? Math.abs(player.car.speed) < 14 : player.speedNow < 42;
  const range = player.car ? 78 : 62;
  if (nearest < range && slow) {
    world.bustT += dt / (player.car ? 3.2 : 2.1);
  } else {
    world.bustT = Math.max(0, world.bustT - dt * 0.9);
  }
  if (world.bustT >= 1) world.gameOver = 'busted';
}

/** Apply the busted outcome: a fine, a clean record, the station doorstep. */
export function applyBusted(world) {
  const door = world.city.specials.police.door;
  world.player.cash = Math.max(0, Math.round(world.player.cash * 0.85));
  world.player.hp = PLAYER.maxHealth;
  world.player.car = null;
  world.player.x = door.x;
  world.player.y = door.y + 8;
  world.wanted.heat = 0;
  syncStars(world);
  world.bustT = 0;
  world.cops = [];
  world.audio?.setEngine(null);
  world.audio?.setSiren(false);
  saveGame(world);
}

/** Apply the wasted outcome: the hospital keeps a cut, she wakes outside. */
export function applyWasted(world) {
  const door = world.city.specials.hospital.door;
  world.player.cash = Math.max(0, Math.round(world.player.cash * 0.9));
  world.player.hp = PLAYER.maxHealth;
  world.player.car = null;
  world.player.x = door.x;
  world.player.y = door.y + 8;
  world.wanted.heat = Math.max(0, world.wanted.heat - 2);
  syncStars(world);
  world.bustT = 0;
  world.audio?.setEngine(null);
  world.audio?.setSiren(false);
  saveGame(world);
}

/**
 * Advance the whole world one fixed step. Input comes from input.js; the
 * mouse aim point in world coordinates is world.mouseWorld, set by main.js.
 */
export function stepWorld(world, input, dt) {
  world.elapsed += dt;
  world.timeOfDay = (world.timeOfDay + dt / 240) % 24; // a full day in 96 minutes
  world.endingT = Math.max(0, world.endingT - dt);

  if (world.dialogue) {
    world.dialogue.t += dt;
    if (input.pressed('KeyE') || world.dialogue.t > 3.6) {
      world.dialogue.index += 1;
      world.dialogue.t = 0;
      if (world.dialogue.index >= world.dialogue.lines.length) world.dialogue = null;
    }
  }
  if (world.banner) {
    world.banner.t += dt;
    if (world.banner.t > 3.4) world.banner = null;
  }

  if (input.pressed('KeyF')) enterExitVehicle(world, input);

  if (world.player.car) stepPlayerCar(world, input, dt);
  else stepPlayerOnFoot(world, input, dt);

  if (world.player.hp <= 0 && !world.gameOver) world.gameOver = 'wasted';

  for (const car of world.cars) stepTrafficCar(world, car, dt);
  for (const ped of world.peds) stepPed(world, ped, dt);
  for (const cop of world.cops) stepCopCar(world, cop, dt);

  // Vehicle meetings, including the player's car against the world.
  const bodies = [...world.cars, ...world.cops];
  if (world.player.car) bodies.push(world.player.car);
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      collideVehicles(world, bodies[i], bodies[j], dt);
    }
  }
  for (const cop of world.cops) {
    const probe = { x: cop.x, y: cop.y };
    if (collideCircle(world.city, probe, 20)) {
      cop.x = probe.x;
      cop.y = probe.y;
      cop.speed *= 0.4;
    }
  }

  // Wanted heat cools when the city has not seen a crime for a while.
  const w = world.wanted;
  if (world.elapsed - w.lastCrimeT > 6 && w.heat > 0) {
    let copNear = false;
    for (const cop of world.cops) {
      if (!cop.dead && dist(cop.x, cop.y, world.player.x, world.player.y) < 330) copNear = true;
    }
    if (!copNear) {
      w.heat = Math.max(0, w.heat - dt / STAR_DECAY_SECONDS);
      syncStars(world);
    }
  }

  maintainPolice(world, dt);
  policePressure(world, dt);
  maintainPopulation(world);
  updateMissions(world, world.story, dt);

  for (const particle of world.particles) {
    particle.t += dt;
    if (particle.x !== undefined && particle.vx !== undefined) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }
  world.particles = world.particles.filter((p) => p.t < p.life);
  for (const skid of world.skids) skid.t += dt;
  world.skids = world.skids.filter((s) => s.t < 7);

  // Camera: follow the player (or her car), looking a little way ahead.
  const focus = world.player.car ?? world.player;
  const lead = world.player.car ? clamp(world.player.car.speed * 0.42, -130, 130) : 0;
  const tx = focus.x + Math.cos(focus.angle ?? 0) * lead;
  const ty = focus.y + Math.sin(focus.angle ?? 0) * lead;
  world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 5);
  world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 5);
  const hw = world.view.w / 2;
  const hh = world.view.h / 2;
  world.camera.x = WORLD_W <= world.view.w ? WORLD_W / 2 : clamp(world.camera.x, hw, WORLD_W - hw);
  world.camera.y = WORLD_H <= world.view.h ? WORLD_H / 2 : clamp(world.camera.y, hh, WORLD_H - hh);
}
