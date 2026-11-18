// entities.js — the people and vehicles that fill Solar Bay: traffic cars
// that keep to their lanes and turn at intersections, pedestrians walking the
// block sidewalks, parked cars, and the police cars that hunt the player.
// Factories build plain state objects; the step functions advance them inside
// the world the simulation owns.
import { CAR_COLORS, CAR_TYPES, CELL, COLS, PED_COLORS, PED_NAMES, ROAD, ROWS, WORLD_H, WORLD_W } from './config.js';
import { LANE_FAR, LANE_NEAR, isRoad, roadLeft, roadTop } from './city.js';
import { angleDelta, chance, clamp, dist, pick, randInt, randRange } from './random.js';

let nextId = 1;

/** The heading angle for travelling along an axis in a direction. */
export function headingAngle(axis, dirSign) {
  if (axis === 'x') return dirSign > 0 ? 0 : Math.PI;
  return dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/**
 * A traffic car placed on a random lane somewhere in the city. It travels
 * along `axis`, holding the cross-axis coordinate `lane`, and turns at
 * intersections by chance, so the traffic pattern never repeats exactly.
 */
export function makeTrafficCar(rng, near = null) {
  const type = pick(rng, CAR_TYPES);
  const car = {
    id: nextId++, kind: 'traffic', type, color: pick(rng, CAR_COLORS),
    x: 0, y: 0, angle: 0, speed: 0, axis: 'x', dirSign: 1, lane: 0,
    hp: 60, dead: false, parked: false, driver: 'ai', honkT: 0,
  };
  if (near && chance(rng, 0.75)) {
    // Spawn on a road near a point (used to keep traffic around the player).
    const vertical = chance(rng, 0.5);
    if (vertical) {
      const i = clamp(Math.round((near.x - ROAD / 2) / (ROAD + 288)) + randInt(rng, -1, 1), 0, COLS);
      car.axis = 'y';
      car.dirSign = chance(rng, 0.5) ? 1 : -1;
      car.lane = roadLeft(i) + (car.dirSign > 0 ? LANE_NEAR : LANE_FAR);
      car.x = car.lane;
      car.y = clamp(near.y + randRange(rng, -700, 700), 60, WORLD_H - 60);
    } else {
      const j = clamp(Math.round((near.y - ROAD / 2) / (ROAD + 288)) + randInt(rng, -1, 1), 0, ROWS);
      car.axis = 'x';
      car.dirSign = chance(rng, 0.5) ? 1 : -1;
      car.lane = roadTop(j) + (car.dirSign > 0 ? LANE_FAR : LANE_NEAR);
      car.y = car.lane;
      car.x = clamp(near.x + randRange(rng, -700, 700), 60, WORLD_W - 60);
    }
  } else if (chance(rng, 0.5)) {
    const i = randInt(rng, 0, COLS);
    car.axis = 'y';
    car.dirSign = chance(rng, 0.5) ? 1 : -1;
    car.lane = roadLeft(i) + (car.dirSign > 0 ? LANE_NEAR : LANE_FAR);
    car.x = car.lane;
    car.y = randRange(rng, 60, WORLD_H - 60);
  } else {
    const j = randInt(rng, 0, ROWS);
    car.axis = 'x';
    car.dirSign = chance(rng, 0.5) ? 1 : -1;
    car.lane = roadTop(j) + (car.dirSign > 0 ? LANE_FAR : LANE_NEAR);
    car.y = car.lane;
    car.x = randRange(rng, 60, WORLD_W - 60);
  }
  car.angle = headingAngle(car.axis, car.dirSign);
  car.speed = car.type.topSpeed * randRange(rng, 0.3, 0.45);
  return car;
}

/** A parked car: same shape, no driver, handbrake on. Angle in radians. */
export function makeParkedCar(rng, x, y, angle, typeOverride = null, colorOverride = null) {
  const type = typeOverride ?? pick(rng, CAR_TYPES);
  return {
    id: nextId++, kind: 'traffic', type, color: colorOverride ?? pick(rng, CAR_COLORS),
    x, y, angle, speed: 0, axis: 'x', dirSign: 1, lane: 0,
    hp: 60, dead: false, parked: true, driver: null, honkT: 0,
  };
}

/** A police car: faster, tougher, and driven by pursuit rather than lanes. */
export function makeCopCar(rng, x, y) {
  const type = CAR_TYPES[1];
  return {
    id: nextId++, kind: 'cop', type, color: '#22303e',
    x, y, angle: randRange(rng, 0, Math.PI * 2), speed: 0, axis: 'x', dirSign: 1, lane: 0,
    hp: 130, dead: false, parked: false, driver: 'cop', honkT: 0, shootT: randRange(rng, 0.5, 1.4),
  };
}

/** The gap to the nearest vehicle ahead of a lane-following car, if any. */
function gapAhead(world, car) {
  let best = Infinity;
  const consider = (other) => {
    if (other === car || other.dead) return;
    const along = car.axis === 'x' ? (other.x - car.x) * car.dirSign : (other.y - car.y) * car.dirSign;
    const across = car.axis === 'x' ? Math.abs(other.y - car.lane) : Math.abs(other.x - car.lane);
    if (along > 0 && along < best && across < 26) best = along;
  };
  for (const other of world.cars) consider(other);
  for (const other of world.cops) consider(other);
  if (world.player.car) consider(world.player.car);
  return best;
}

/**
 * Advance a lane-following traffic car: hold a traffic pace, brake for the
 * car in front, and at each intersection crossing maybe turn onto the road
 * whose lane line is being crossed. Turns happen exactly on the crossing of
 * the two lane centre lines, which always lies inside the intersection.
 */
export function stepTrafficCar(world, car, dt) {
  if (car.parked || car.dead) return;
  const rng = world.rng;
  const cruise = car.type.topSpeed * 0.5;
  const gap = gapAhead(world, car);
  let wanted = cruise;
  if (gap < 90) wanted = Math.min(wanted, Math.max(0, (gap - 34) * 2.2));
  if (gap < 40 && car.honkT <= 0) car.honkT = 1.6;
  car.honkT = Math.max(0, car.honkT - dt);
  const accel = wanted > car.speed ? car.type.accel * 0.6 : 420;
  car.speed += clamp(wanted - car.speed, -accel * dt, accel * dt);

  const before = car.axis === 'x' ? car.x : car.y;
  const after = before + car.dirSign * car.speed * dt;

  // Intersection lane lines ahead on the cross axis.
  const crossCount = car.axis === 'x' ? COLS : ROWS;
  for (let i = 0; i <= crossCount; i += 1) {
    const roadStart = (car.axis === 'x' ? roadLeft(i) : roadTop(i));
    for (const offset of [LANE_NEAR, LANE_FAR]) {
      const line = roadStart + offset;
      const crossed = car.dirSign > 0 ? before < line && after >= line : before > line && after <= line;
      if (!crossed) continue;
      // Turning at this line: NEAR line heads +, FAR line heads -.
      if (chance(rng, 0.3)) {
        const turnSign = offset === LANE_NEAR ? 1 : -1;
        if (car.axis === 'x') {
          car.x = line;
          car.axis = 'y';
          car.dirSign = turnSign;
          car.lane = line;
        } else {
          car.y = line;
          car.axis = 'x';
          car.dirSign = turnSign;
          car.lane = line;
        }
        car.angle = headingAngle(car.axis, car.dirSign);
        return;
      }
    }
  }

  if (car.axis === 'x') car.x = after; else car.y = after;

  // At the city edge, U-turn onto the same road's other lane.
  const limit = car.axis === 'x' ? WORLD_W : WORLD_H;
  const pos = car.axis === 'x' ? car.x : car.y;
  if (pos < 26 || pos > limit - 26) {
    const bandStart = Math.floor(car.lane / CELL) * CELL;
    car.dirSign *= -1;
    if (car.axis === 'x') {
      car.y = bandStart + (car.dirSign > 0 ? LANE_FAR : LANE_NEAR);
      car.lane = car.y;
      car.x = clamp(car.x, 26, WORLD_W - 26);
    } else {
      car.x = bandStart + (car.dirSign > 0 ? LANE_NEAR : LANE_FAR);
      car.lane = car.x;
      car.y = clamp(car.y, 26, WORLD_H - 26);
    }
    car.angle = headingAngle(car.axis, car.dirSign);
  }

  const target = headingAngle(car.axis, car.dirSign);
  car.angle += angleDelta(car.angle, target) * Math.min(1, dt * 8);
}

/** A pedestrian walking the perimeter of one block's sidewalk. */
export function makePed(rng, rect) {
  const inset = 9;
  const w = rect.w - inset * 2;
  const h = rect.h - inset * 2;
  return {
    id: nextId++, kind: 'ped',
    name: pick(rng, PED_NAMES), color: pick(rng, PED_COLORS),
    rect: { x: rect.x + inset, y: rect.y + inset, w, h },
    s: randRange(rng, 0, 2 * (w + h)),
    speed: randRange(rng, 34, 58),
    angle: 0, x: 0, y: 0,
    state: 'walk', stateT: 0, waitT: randRange(rng, 0, 4), deadT: 0,
  };
}

/** Position and heading of a pedestrian at perimeter distance s. */
export function pedPose(ped) {
  const { x, y, w, h } = ped.rect;
  const perimeter = 2 * (w + h);
  let s = ((ped.s % perimeter) + perimeter) % perimeter;
  if (s < w) return { x: x + s, y, angle: 0 };
  s -= w;
  if (s < h) return { x: x + w, y: y + s, angle: Math.PI / 2 };
  s -= h;
  if (s < w) return { x: x + w - s, y: y + h, angle: Math.PI };
  s -= w;
  return { x, y: y + h - s, angle: -Math.PI / 2 };
}

/** Advance a pedestrian: stroll the block, pause now and then, run if scared. */
export function stepPed(world, ped, dt) {
  if (ped.state === 'down') {
    ped.deadT += dt;
    return;
  }
  if (ped.state === 'flee') {
    ped.stateT -= dt;
    ped.s += ped.speed * 2.6 * dt;
    if (ped.stateT <= 0) ped.state = 'walk';
  } else if (ped.waitT > 0) {
    ped.waitT -= dt;
  } else {
    ped.s += ped.speed * dt;
    if (chance(world.rng, dt * 0.05)) ped.waitT = randRange(world.rng, 1, 4);
  }
  const pose = pedPose(ped);
  ped.x = pose.x;
  ped.y = pose.y;
  ped.angle = pose.angle;
}

/** Scare every pedestrian near a point (a shot, a crash, a near miss). */
export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.stateT = randRange(world.rng, 1.5, 3);
    }
  }
}

/**
 * Advance a police car: steer at the player's predicted position, cutting
 * across blocks when the way is clear and falling back to the nearest road
 * crossing when a building blocks the line. Disabled cars (hp spent) smoke
 * and stop.
 */
export function stepCopCar(world, cop, dt) {
  if (cop.dead) return;
  if (cop.hp <= 0) {
    cop.dead = true;
    cop.speed = 0;
    return;
  }
  const player = world.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  let tx = px;
  let ty = py;
  if (!world.cityClear(px, py, cop.x, cop.y)) {
    // Aim for the road crossing nearest the player until the line opens.
    const ci = clamp(Math.round(px / (ROAD + 288)), 0, COLS);
    const cj = clamp(Math.round(py / (ROAD + 288)), 0, ROWS);
    tx = roadLeft(ci) + ROAD / 2;
    ty = roadTop(cj) + ROAD / 2;
    if (dist(cop.x, cop.y, tx, ty) < 60) {
      tx = px;
      ty = py;
    }
  }
  const want = Math.atan2(ty - cop.y, tx - cop.x);
  const turn = angleDelta(cop.angle, want);
  const topSpeed = player.car ? 478 : 420;
  const d = dist(cop.x, cop.y, px, py);
  let speed = topSpeed;
  if (d < 90) speed = topSpeed * 0.55;
  if (d < 40) speed = topSpeed * 0.25;
  cop.angle += clamp(turn, -2.6 * dt, 2.6 * dt);
  cop.speed += clamp(speed - cop.speed, -380 * dt, 300 * dt);
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;
  cop.x = clamp(cop.x, 20, WORLD_W - 20);
  cop.y = clamp(cop.y, 20, WORLD_H - 20);
}
