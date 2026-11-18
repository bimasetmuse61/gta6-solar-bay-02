// city.js — builds Solar Bay itself: the road grid, the blocks and buildings
// (with the named places the story needs), parks, palms, and the geometry
// helpers the traffic, pedestrians and collisions all share. The layout is
// generated from a seed, but the special places sit on fixed blocks so the
// missions can always find them.
import { BLOCK, BUILDING_KINDS, CELL, COLS, ROAD, ROWS, WORLD_H, WORLD_W } from './config.js';
import { chance, pick, randInt, randRange } from './random.js';

// Lane centre lines, as offsets inside a road's width. Traffic keeps right:
// heading south or west rides the 0.30 line, north or east the 0.70 line.
export const LANE_NEAR = Math.round(ROAD * 0.3);
export const LANE_FAR = Math.round(ROAD * 0.7);

const NAME_SUFFIX = ['Brisa', 'del Sol', 'Azahar', 'Miramar', 'Coral', 'Palmera', 'Ondina', 'Faro', 'Serena', 'Tamarindo'];

// The story's fixed addresses, by block column and row.
const SPECIAL_BLOCKS = {
  garage: { col: 1, row: 4, type: 'garage', name: "Dario's Garage", roof: '#707a88' },
  casino: { col: 6, row: 1, type: 'casino', name: 'The Palms Casino', roof: '#7a4a8c' },
  bank: { col: 4, row: 3, type: 'bank', name: 'Banco del Sol', roof: '#a8a29a' },
  marina: { col: 2, row: 7, type: 'warehouse', name: 'Marina Warehouse', roof: '#5d7a86' },
  safehouse: { col: 1, row: 1, type: 'safehouse', name: 'Coral Heights Safehouse', roof: '#b5654d' },
  police: { col: 5, row: 5, type: 'police', name: 'Solar Bay PD', roof: '#4a5a74' },
  hospital: { col: 3, row: 5, type: 'hospital', name: 'St. Alba Hospital', roof: '#d8d3c3' },
};

// Blocks that stay green instead of built up (column,row keys).
const PARK_KEYS = new Set(['3,1', '5,2', '2,5', '6,6', '0,2']);

/** Left edge x of the vertical road with index i (0..COLS). */
export function roadLeft(i) {
  return i * CELL;
}

/** Top edge y of the horizontal road with index j (0..ROWS). */
export function roadTop(j) {
  return j * CELL;
}

/** The block rectangle for a column and row: its ground is the sidewalk. */
export function blockRect(col, row) {
  return { x: col * CELL + ROAD, y: row * CELL + ROAD, w: BLOCK, h: BLOCK };
}

/** True when a point lies on any road (not on a block). */
export function isRoad(x, y) {
  return x % CELL < ROAD || y % CELL < ROAD;
}

/**
 * Build the whole city from a seeded generator. Returns the buildings (solid
 * AABBs with a type, a name and a roof colour), the parks, the palms, and a
 * specials map from story key to { building, door } where door is the point
 * on the sidewalk in front of the place, used for mission markers.
 */
export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const palms = [];
  const specials = {};

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const rect = blockRect(col, row);
      const key = `${col},${row}`;
      const specialKey = Object.keys(SPECIAL_BLOCKS).find((name) => {
        const spot = SPECIAL_BLOCKS[name];
        return spot.col === col && spot.row === row;
      });

      if (specialKey) {
        // One landmark building centred on the block, with a forecourt.
        const spot = SPECIAL_BLOCKS[specialKey];
        const w = randInt(rng, 168, 196);
        const h = randInt(rng, 140, 168);
        const building = {
          x: rect.x + (BLOCK - w) / 2,
          y: rect.y + (BLOCK - h) / 2,
          w,
          h,
          floors: randInt(rng, 3, 6),
          type: spot.type,
          name: spot.name,
          roof: spot.roof,
          special: specialKey,
        };
        buildings.push(building);
        specials[specialKey] = {
          building,
          door: { x: building.x + building.w / 2, y: building.y + building.h + 26 },
        };
        continue;
      }

      if (PARK_KEYS.has(key)) {
        parks.push({ ...rect, trees: [] });
        const park = parks[parks.length - 1];
        for (let t = 0; t < 7; t += 1) {
          park.trees.push({
            x: rect.x + randRange(rng, 26, BLOCK - 26),
            y: rect.y + randRange(rng, 26, BLOCK - 26),
            r: randRange(rng, 13, 22),
          });
        }
        continue;
      }

      // Ordinary block: four lots in a 2x2, each with its own building.
      const margin = 18;
      const gap = 18;
      const lot = (BLOCK - margin * 2 - gap) / 2;
      for (let ly = 0; ly < 2; ly += 1) {
        for (let lx = 0; lx < 2; lx += 1) {
          if (chance(rng, 0.08)) continue; // the odd empty lot / car park
          const kind = pick(rng, BUILDING_KINDS);
          const w = randRange(rng, lot * 0.72, lot * 0.96);
          const h = randRange(rng, lot * 0.72, lot * 0.96);
          buildings.push({
            x: rect.x + margin + lx * (lot + gap) + (lot - w) / 2,
            y: rect.y + margin + ly * (lot + gap) + (lot - h) / 2,
            w,
            h,
            floors: randInt(rng, 1, 9),
            type: kind.type,
            name: `${kind.label} ${pick(rng, NAME_SUFFIX)}`,
            roof: kind.roof,
            special: null,
          });
        }
      }

      // Palms lean over the beachfront row and dot the other sidewalks.
      if (row === ROWS - 1 || chance(rng, 0.4)) {
        const count = row === ROWS - 1 ? 4 : 2;
        for (let p = 0; p < count; p += 1) {
          palms.push({
            x: rect.x + randRange(rng, 8, BLOCK - 8),
            y: rect.y + randRange(rng, 4, 14),
          });
        }
      }
    }
  }

  return { buildings, parks, palms, specials, width: WORLD_W, height: WORLD_H };
}

/** The building whose footprint contains a point, or null. */
export function buildingAt(city, x, y) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/**
 * Push a circle out of every building it overlaps and clamp it inside the
 * world. Returns true when a push happened (a collision worth a thud).
 */
export function collideCircle(city, point, radius) {
  let hit = false;
  if (point.x < radius) { point.x = radius; hit = true; }
  if (point.y < radius) { point.y = radius; hit = true; }
  if (point.x > city.width - radius) { point.x = city.width - radius; hit = true; }
  if (point.y > city.height - radius) { point.y = city.height - radius; hit = true; }
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const nearX = Math.max(b.x, Math.min(point.x, b.x + b.w));
    const nearY = Math.max(b.y, Math.min(point.y, b.y + b.h));
    const dx = point.x - nearX;
    const dy = point.y - nearY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      point.x = nearX + (dx / d) * radius;
      point.y = nearY + (dy / d) * radius;
    } else {
      // Centre inside the box: leave by the shortest side.
      const left = point.x - b.x;
      const right = b.x + b.w - point.x;
      const top = point.y - b.y;
      const bottom = b.y + b.h - point.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) point.x = b.x - radius;
      else if (min === right) point.x = b.x + b.w + radius;
      else if (min === top) point.y = b.y - radius;
      else point.y = b.y + b.h + radius;
    }
  }
  return hit;
}

/** True when the straight line between two points crosses no building. */
export function lineOfSight(city, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24);
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    if (buildingAt(city, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

/** A random point on a random road, snapped to the middle of the asphalt. */
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    const i = randInt(rng, 0, COLS);
    return { x: roadLeft(i) + ROAD / 2, y: randRange(rng, 40, WORLD_H - 40) };
  }
  const j = randInt(rng, 0, ROWS);
  return { x: randRange(rng, 40, WORLD_W - 40), y: roadTop(j) + ROAD / 2 };
}

/** A random point on a random block's sidewalk edge, where people walk. */
export function randomSidewalkPoint(rng) {
  const rect = blockRect(randInt(rng, 0, COLS - 1), randInt(rng, 0, ROWS - 1));
  const side = randInt(rng, 0, 3);
  const along = randRange(rng, 12, BLOCK - 12);
  if (side === 0) return { x: rect.x + along, y: rect.y + 9 };
  if (side === 1) return { x: rect.x + along, y: rect.y + BLOCK - 9 };
  if (side === 2) return { x: rect.x + 9, y: rect.y + along };
  return { x: rect.x + BLOCK - 9, y: rect.y + along };
}
