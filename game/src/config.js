// config.js — the shared numbers and names of Solar Bay.
// Everything tunable lives here so the other modules stay about behaviour:
// the city grid, the palette, the car catalogue, and the words the city uses.

// The city is a grid: square blocks of BLOCK pixels separated by roads of ROAD
// pixels, COLS by ROWS blocks, with one more road along each far edge.
export const ROAD = 96;
export const BLOCK = 288;
export const CELL = ROAD + BLOCK;
export const COLS = 8;
export const ROWS = 8;
export const WORLD_W = COLS * CELL + ROAD;
export const WORLD_H = ROWS * CELL + ROAD;

// Fixed simulation step (seconds). The world advances in these slices so the
// same inputs always produce the same city, which the screenshot scenes need.
export const STEP = 1 / 60;

// Golden-afternoon palette: sun-soaked streets, teal water, coral roofs.
export const COLORS = {
  water: '#1d7f96',
  waterDeep: '#146a84',
  sand: '#ecd29a',
  grass: '#79b657',
  grassDark: '#679c49',
  sidewalk: '#cfc8b8',
  sidewalkEdge: '#b7b09c',
  road: '#3c4147',
  roadEdge: '#2f3338',
  laneMark: '#e8e3c8',
  crosswalk: '#ddd8c4',
  roofShadow: 'rgba(23, 32, 40, 0.35)',
  night: 'rgba(16, 24, 58, 0.0)',
};

// Cars the traffic system and the player share. length/width are the top-down
// footprint in pixels; topSpeed and accel are pixels per second (and squared).
export const CAR_TYPES = [
  { kind: 'compact', name: 'Pico Compact', length: 42, width: 21, topSpeed: 330, accel: 250, grip: 3.4 },
  { kind: 'sedan', name: 'Meridian Sedan', length: 48, width: 22, topSpeed: 370, accel: 265, grip: 3.2 },
  { kind: 'coupe', name: 'Vireo Coupe', length: 47, width: 22, topSpeed: 430, accel: 320, grip: 3.6 },
  { kind: 'sunset', name: 'Sunset GT', length: 49, width: 23, topSpeed: 490, accel: 360, grip: 3.8 },
  { kind: 'van', name: 'Cargo Van', length: 54, width: 24, topSpeed: 300, accel: 210, grip: 2.8 },
  { kind: 'pickup', name: 'Dune Pickup', length: 52, width: 24, topSpeed: 350, accel: 240, grip: 3.0 },
  { kind: 'taxi', name: 'Solar Cab', length: 48, width: 22, topSpeed: 360, accel: 255, grip: 3.2 },
];

export const CAR_COLORS = [
  '#e4572e', '#f2a03d', '#f7d154', '#7fb069', '#2a9d8f', '#457b9d',
  '#9b5de5', '#ef476f', '#e8e8e8', '#9aa5b1', '#34495e', '#c0b283',
];

export const GOLD_COUPE_COLOR = '#f5c542';

// Pedestrian shirt colours and the first names the city gives its people.
export const PED_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#e07a5f', '#81b29a', '#f2cc8f', '#bc6c25'];
export const PED_NAMES = [
  'Alba', 'Bruno', 'Celia', 'Dario', 'Elena', 'Felix', 'Gala', 'Hugo',
  'Ines', 'Jorge', 'Kira', 'Lorenzo', 'Marta', 'Nico', 'Olga', 'Pablo',
  'Rosa', 'Santi', 'Teresa', 'Umar', 'Vera', 'Walter', 'Xenia', 'Yusuf',
];

// Ordinary buildings: a type brings a roof colour and a sign the renderer
// paints on the roof, so the city reads as places, not boxes.
export const BUILDING_KINDS = [
  { type: 'cafe', label: 'Café', roof: '#d98e6a' },
  { type: 'bakery', label: 'Bakery', roof: '#e3b778' },
  { type: 'shop', label: 'Shop', roof: '#b56576' },
  { type: 'hotel', label: 'Hotel', roof: '#6d8ea0' },
  { type: 'office', label: 'Offices', roof: '#8d99ae' },
  { type: 'apartments', label: 'Apartments', roof: '#c97c5d' },
  { type: 'gym', label: 'Gym', roof: '#5f8d4e' },
  { type: 'pharmacy', label: 'Pharmacy', roof: '#7fb5b5' },
  { type: 'bar', label: 'Bar', roof: '#9d4edd' },
  { type: 'market', label: 'Market', roof: '#e0a458' },
];

// Player numbers.
export const PLAYER = {
  radius: 10,
  walkSpeed: 155,
  runSpeed: 245,
  maxHealth: 100,
};

// Wanted tuning: stars run 0..MAX_STARS; heat is the fractional build-up.
export const MAX_STARS = 5;
export const STAR_DECAY_SECONDS = 26;

// The pistol: hitscan, modest range, a shot every FIRE_DELAY seconds.
export const GUN = { range: 430, fireDelay: 0.22, damage: 34 };
