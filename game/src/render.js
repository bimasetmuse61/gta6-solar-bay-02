// render.js — everything Solar Bay paints: the city from above (roads,
// sidewalks, parks, roofs and palms), its cars and people, the weather of
// light across the day, and the HUD with its minimap, wanted stars, mission
// banner and dialogue. Screens (title, play, pause, busted, wasted) are
// values the boot module switches between; this file only draws.
import { BLOCK, CELL, COLS, COLORS, ROAD, ROWS, WORLD_H, WORLD_W } from './config.js';
import { blockRect, roadLeft, roadTop } from './city.js';
import { clamp, dist } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

/** Rounded-rect path with a plain-rect fallback for older canvas builds. */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** How dark the day is at a given hour: 0 in daylight, up to 0.42 at night. */
export function darknessAt(hour) {
  if (hour >= 7 && hour <= 17.5) return 0;
  if (hour > 17.5 && hour < 20) return (hour - 17.5) / 2.5 * 0.42;
  if (hour >= 20 || hour <= 5) return 0.42;
  return (1 - (hour - 5) / 2) * 0.42;
}

function drawBuilding(ctx, b, dark) {
  const lift = b.floors * 1.6;
  // Wall block, then the roof lifted up-left by the building's height.
  ctx.fillStyle = 'rgba(20, 28, 36, 0.30)';
  ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
  ctx.fillStyle = '#6e6259';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x - lift * 0.4, b.y - lift, b.w, b.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.strokeRect(b.x - lift * 0.4, b.y - lift, b.w, b.h);
  // Window grid on the roof face; lit windows glow after dark.
  const cols = Math.max(2, Math.floor(b.w / 26));
  const rows = Math.max(2, Math.floor(b.h / 26));
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const lit = ((i * 7 + j * 13 + b.floors) % 5) === 0;
      ctx.fillStyle = dark > 0.12 && lit ? 'rgba(255, 214, 120, 0.95)' : 'rgba(30, 42, 54, 0.35)';
      ctx.fillRect(b.x - lift * 0.4 + 8 + i * ((b.w - 14) / cols), b.y - lift + 8 + j * ((b.h - 14) / rows), 9, 6);
    }
  }
  if (b.special || b.floors >= 7) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2 - lift * 0.4, b.y - lift + b.h / 2 + 3);
  }
}

function drawPalm(ctx, palm) {
  ctx.strokeStyle = '#8a6d46';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(palm.x, palm.y);
  ctx.lineTo(palm.x + 3, palm.y - 7);
  ctx.stroke();
  ctx.strokeStyle = '#4e9a3f';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
    ctx.beginPath();
    ctx.moveTo(palm.x + 3, palm.y - 7);
    ctx.quadraticCurveTo(
      palm.x + 3 + Math.cos(a) * 9, palm.y - 12 + Math.sin(a) * 3,
      palm.x + 3 + Math.cos(a) * 15, palm.y - 6 + Math.sin(a) * 6,
    );
    ctx.stroke();
  }
}

function drawCar(ctx, car, world) {
  const { length, width } = car.type;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(15, 22, 28, 0.35)';
  rr(ctx, -length / 2 + 3, -width / 2 + 4, length, width, 6);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#15181c';
  const wx = length / 2 - 11;
  const wy = width / 2 - 2;
  ctx.fillRect(-wx - 4, -wy - 2, 9, 5);
  ctx.fillRect(wx - 5, -wy - 2, 9, 5);
  ctx.fillRect(-wx - 4, wy - 3, 9, 5);
  ctx.fillRect(wx - 5, wy - 3, 9, 5);
  // Body and cabin.
  ctx.fillStyle = car.dead || car.hp <= 0 ? '#4b4f54' : car.color;
  rr(ctx, -length / 2, -width / 2, length, width, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(16, 24, 32, 0.85)';
  rr(ctx, -length * 0.16, -width / 2 + 3, length * 0.34, width - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(190, 225, 240, 0.5)';
  ctx.fillRect(length * 0.14, -width / 2 + 4, 4, width - 8);
  // Headlights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(length / 2 - 3, -width / 2 + 3, 3, 4);
  ctx.fillRect(length / 2 - 3, width / 2 - 7, 3, 4);
  if (car.kind === 'cop') {
    ctx.fillStyle = '#eef1f4';
    ctx.fillRect(-length * 0.14, -width / 2 + 2, length * 0.3, 4);
    ctx.fillRect(-length * 0.14, width / 2 - 6, length * 0.3, 4);
    const phase = Math.floor(world.elapsed * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff4040' : '#4060ff';
    rr(ctx, -7, -4, 14, 8, 3);
    ctx.fill();
  }
  if (car.type.kind === 'taxi') {
    ctx.fillStyle = '#ffd83d';
    rr(ctx, -5, -4, 10, 8, 2);
    ctx.fill();
  }
  if (car.mission) {
    ctx.strokeStyle = 'rgba(255, 216, 61, 0.9)';
    ctx.lineWidth = 2;
    rr(ctx, -length / 2 - 3, -width / 2 - 3, length + 6, width + 6, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPed(ctx, ped, world) {
  if (ped.state === 'down') {
    const alpha = clamp(1 - ped.deadT / 24, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    rr(ctx, -13, -5, 26, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(16, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(15, 22, 28, 0.28)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const stride = Math.sin(ped.s * 0.55) * 4;
  ctx.strokeStyle = '#2d3436';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ped.angle) * stride, Math.sin(ped.angle) * stride + 4);
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.cos(ped.angle) * stride, -Math.sin(ped.angle) * stride + 4);
  ctx.stroke();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(Math.cos(ped.angle) * 2, Math.sin(ped.angle) * 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void world;
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.car) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(15, 22, 28, 0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  ctx.fillStyle = '#0f766e'; // Marina's teal jacket
  rr(ctx, -8, -8, 16, 16, 6);
  ctx.fill();
  ctx.fillStyle = '#134e4a';
  ctx.fillRect(-8, -8, 6, 16);
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(2, 0, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b2a20';
  ctx.beginPath();
  ctx.arc(0.5, 0, 5, Math.PI * 0.9, Math.PI * 1.9);
  ctx.fill();
  // The pistol, when she is aiming.
  if (world.mouseDown) {
    ctx.fillStyle = '#1c2126';
    ctx.fillRect(6, -2, 11, 4);
  }
  ctx.restore();
}

function drawObjectiveMarker(ctx, world, camX, camY) {
  const o = world.objective;
  if (!o) return;
  const x = o.x - camX;
  const y = o.y - camY;
  const bob = Math.sin(world.elapsed * 3.2) * 5;
  ctx.save();
  ctx.strokeStyle = o.side ? 'rgba(64, 224, 255, 0.5)' : 'rgba(255, 205, 50, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - 190);
  ctx.lineTo(x, y - 8);
  ctx.stroke();
  ctx.fillStyle = o.side ? '#40e0ff' : '#ffcd32';
  ctx.translate(x, y - 26 + bob);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
}

/** Draw the whole city and its actors from the camera's point of view. */
export function drawWorld(ctx, world, view, camOverride = null) {
  const camX = (camOverride ? camOverride.x : world.camera.x) - view.w / 2;
  const camY = (camOverride ? camOverride.y : world.camera.y) - view.h / 2;
  const dark = darknessAt(world.timeOfDay);
  world._dark = dark;

  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(-camX - 60, -camY - 60, WORLD_W + 120, WORLD_H + 120);

  ctx.save();
  ctx.translate(-camX, -camY);

  // Sand rim and grass base, then the beachfront strip along the south row.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(-26, -26, WORLD_W + 52, WORLD_H + 52);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(0, 7 * CELL, WORLD_W, WORLD_H - 7 * CELL);

  // Sidewalks (block ground), then parks over them.
  ctx.fillStyle = COLORS.sidewalk;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const b = blockRect(c, r);
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }
  for (const park of world.city.parks) {
    ctx.fillStyle = COLORS.grassDark;
    ctx.fillRect(park.x + 6, park.y + 6, park.w - 12, park.h - 12);
    ctx.strokeStyle = 'rgba(240, 230, 200, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(park.x + 10, park.y + park.h / 2);
    ctx.lineTo(park.x + park.w - 10, park.y + park.h / 2);
    ctx.moveTo(park.x + park.w / 2, park.y + 10);
    ctx.lineTo(park.x + park.w / 2, park.y + park.h - 10);
    ctx.stroke();
    for (const tree of park.trees) {
      ctx.fillStyle = '#3f7d33';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#57a047';
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads, lane dashes and crosswalks.
  ctx.fillStyle = COLORS.road;
  for (let i = 0; i <= COLS; i += 1) ctx.fillRect(roadLeft(i), 0, ROAD, WORLD_H);
  for (let j = 0; j <= ROWS; j += 1) ctx.fillRect(0, roadTop(j), WORLD_W, ROAD);
  ctx.fillStyle = COLORS.laneMark;
  for (let i = 0; i <= COLS; i += 1) {
    for (let y = 8; y < WORLD_H; y += 40) {
      if (y % CELL < ROAD - 6) continue;
      ctx.fillRect(roadLeft(i) + ROAD / 2 - 2, y, 4, 22);
    }
  }
  for (let j = 0; j <= ROWS; j += 1) {
    for (let x = 8; x < WORLD_W; x += 40) {
      if (x % CELL < ROAD - 6) continue;
      ctx.fillRect(x, roadTop(j) + ROAD / 2 - 2, 22, 4);
    }
  }
  ctx.fillStyle = COLORS.crosswalk;
  for (let i = 0; i <= COLS; i += 1) {
    for (let j = 0; j <= ROWS; j += 1) {
      const x = roadLeft(i);
      const y = roadTop(j);
      for (let s = 0; s < 4; s += 1) {
        ctx.fillRect(x + 8 + s * 22, y - 9, 12, 6);
        ctx.fillRect(x + 8 + s * 22, y + ROAD + 3, 12, 6);
        ctx.fillRect(x - 9, y + 8 + s * 22, 6, 12);
        ctx.fillRect(x + ROAD + 3, y + 8 + s * 22, 6, 12);
      }
    }
  }

  // Skid marks under everything that moves.
  ctx.strokeStyle = 'rgba(20, 20, 22, 0.4)';
  ctx.lineWidth = 4;
  for (const skid of world.skids) {
    const a = clamp(1 - skid.t / 7, 0, 1) * 0.4;
    ctx.strokeStyle = `rgba(20, 20, 22, ${a})`;
    ctx.beginPath();
    ctx.moveTo(skid.x - Math.cos(skid.angle) * 8, skid.y - Math.sin(skid.angle) * 8);
    ctx.lineTo(skid.x + Math.cos(skid.angle) * 8, skid.y + Math.sin(skid.angle) * 8);
    ctx.stroke();
  }

  for (const palm of world.city.palms) drawPalm(ctx, palm);
  for (const b of world.city.buildings) drawBuilding(ctx, b, dark);

  if (world.packageAt) {
    const bob = Math.sin(world.elapsed * 4) * 4;
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(world.packageAt.x - 11, world.packageAt.y - 11 + bob, 22, 22);
    ctx.strokeStyle = '#f7d154';
    ctx.lineWidth = 2;
    ctx.strokeRect(world.packageAt.x - 11, world.packageAt.y - 11 + bob, 22, 22);
  }

  for (const ped of world.peds) drawPed(ctx, ped, world);
  for (const car of world.cars) drawCar(ctx, car, world);
  for (const cop of world.cops) drawCar(ctx, cop, world);
  if (world.player.car) drawCar(ctx, world.player.car, world);
  drawPlayer(ctx, world);

  // Particles: tracers first, then sparks, smoke and flashes.
  for (const p of world.particles) {
    const lifeLeft = 1 - p.t / p.life;
    if (p.kind === 'tracer') {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = lifeLeft;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = lifeLeft * 0.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + p.t * 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = lifeLeft;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeLeft + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  // Light: warm at golden hour, deep blue at night.
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(14, 20, 52, ${dark})`;
    ctx.fillRect(0, 0, view.w, view.h);
  } else if (world.timeOfDay > 15 && world.timeOfDay < 19.5) {
    ctx.fillStyle = 'rgba(255, 166, 66, 0.07)';
    ctx.fillRect(0, 0, view.w, view.h);
  }

  drawObjectiveMarker(ctx, world, camX, camY);
  return { camX, camY };
}

function starRow(ctx, world, x, y) {
  const stars = world.wanted.stars;
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#ffcd32' : 'rgba(255,255,255,0.28)';
    ctx.fillText('★', x - (4 - i) * 24, y);
  }
  if (stars > 0 && Math.floor(world.elapsed * 2) % 2 === 0) {
    ctx.fillStyle = 'rgba(255, 80, 60, 0.9)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('WANTED', x, y + 16);
  }
}

function drawMinimap(ctx, world, view) {
  const size = 172;
  const x0 = view.w - size - 14;
  const y0 = view.h - size - 14;
  const scale = size / WORLD_W;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#10222c';
  rr(ctx, x0 - 4, y0 - 4, size + 8, size + 8, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.fillStyle = '#274b36';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#3c4147';
  for (let i = 0; i <= COLS; i += 1) ctx.fillRect(x0 + (roadLeft(i) + ROAD / 2) * scale - 1, y0, 2, size);
  for (let j = 0; j <= ROWS; j += 1) ctx.fillRect(x0, y0 + (roadTop(j) + ROAD / 2) * scale - 1, size, 2);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(x0, y0 + 7 * CELL * scale, size, size - 7 * CELL * scale);
  const dot = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + wx * scale, y0 + wy * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const cop of world.cops) {
    if (!cop.dead) dot(cop.x, cop.y, Math.floor(world.elapsed * 3) % 2 ? '#ff5040' : '#4d7cff', 3);
  }
  if (world.objective) dot(world.objective.x, world.objective.y, '#ffcd32', 4);
  if (world.missionCar) dot(world.missionCar.x, world.missionCar.y, '#ffffff', 2.5);
  // The player, as a heading triangle.
  const p = world.player;
  ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The heads-up display over the playing world. */
export function drawHud(ctx, world, view) {
  const p = world.player;
  // Top-left: who she is, how she is, what she has.
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#0d1b26';
  rr(ctx, 14, 14, 218, 74, 10);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MARINA SOLANO', 26, 38);
  ctx.fillStyle = '#7ee787';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 26, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rr(ctx, 108, 48, 112, 11, 5);
  ctx.fill();
  ctx.fillStyle = p.hp > 30 ? '#4ade80' : '#f87171';
  rr(ctx, 108, 48, Math.max(0, 112 * (p.hp / 100)), 11, 5);
  ctx.fill();

  // Top-right: the law's opinion, and the time.
  starRow(ctx, world, view.w - 22, 40);
  const hh = Math.floor(world.timeOfDay);
  const mm = Math.floor((world.timeOfDay - hh) * 60);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, view.w - 22, 78);

  // Objective line, top centre, with its distance.
  if (world.objective) {
    const o = world.objective;
    const d = Math.round(dist(p.x, p.y, o.x, o.y) / 10);
    ctx.font = '600 14px system-ui, sans-serif';
    const text = `${o.label}  ·  ${d} m`;
    const w = ctx.measureText(text).width + 30;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#0d1b26';
    rr(ctx, (view.w - w) / 2, 14, w, 30, 8);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = o.side ? '#7ee7ff' : '#ffd968';
    ctx.textAlign = 'center';
    ctx.fillText(text, view.w / 2, 34);
    if (o.progress !== null && o.progress !== undefined) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      rr(ctx, view.w / 2 - 70, 48, 140, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#ffd968';
      rr(ctx, view.w / 2 - 70, 48, 140 * clamp(o.progress, 0, 1), 6, 3);
      ctx.fill();
    }
  }

  // Mission banner.
  if (world.banner) {
    const a = clamp(1 - Math.max(0, world.banner.t - 2.6) / 0.8, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText(world.banner.title, view.w / 2, 108);
    ctx.fillStyle = '#ffd968';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(world.banner.sub, view.w / 2, 132);
    ctx.restore();
  }

  // Dialogue along the bottom.
  if (world.dialogue) {
    const line = world.dialogue.lines[world.dialogue.index];
    if (line) {
      const w = Math.min(680, view.w - 80);
      const x = (view.w - w) / 2;
      const y = view.h - 108;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#0a141d';
      rr(ctx, x, y, w, 62, 10);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd968';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(line[0], x + 16, y + 22);
      ctx.fillStyle = '#f2f5f7';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(line[1], x + 16, y + 44, w - 32);
    }
  }

  // The bust meter, centre screen, impossible to ignore.
  if (world.bustT > 0.04) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5040';
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText('BUSTED?', view.w / 2, view.h / 2 - 90);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(ctx, view.w / 2 - 110, view.h / 2 - 78, 220, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#ff5040';
    rr(ctx, view.w / 2 - 110, view.h / 2 - 78, 220 * clamp(world.bustT, 0, 1), 10, 5);
    ctx.fill();
    ctx.restore();
  }

  // Low health closes in at the edges.
  if (p.hp < 32) {
    const pulse = 0.25 + Math.sin(world.elapsed * 5) * 0.08;
    const grad = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.36, view.w / 2, view.h / 2, view.h * 0.75);
    grad.addColorStop(0, 'rgba(160, 20, 20, 0)');
    grad.addColorStop(1, `rgba(160, 20, 20, ${pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  drawMinimap(ctx, world, view);

  // Controls reminder, bottom-left, small.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    p.car ? 'WASD drive · SPACE handbrake · F get out · P pause'
          : 'WASD move · SHIFT run · F take car · CLICK shoot · E talk · P pause',
    16, view.h - 16,
  );

  // The ending card, over the last scene of the story.
  if (world.endingT > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(world.endingT, 0, 0.85);
    ctx.fillStyle = '#0a141d';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd968';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText('THE END', view.w / 2, view.h / 2 - 20);
    ctx.fillStyle = '#f2f5f7';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('The family is square. Solar Bay keeps turning — free roam, courier work, and trouble remain.', view.w / 2, view.h / 2 + 16);
    ctx.restore();
  }
}

/** The menu item rectangles of the title screen, shared by draw and clicks. */
export function titleMenuRects(view, count) {
  const w = 280;
  const h = 36;
  const gap = 10;
  const y0 = Math.round(view.h * 0.52);
  const rects = [];
  for (let i = 0; i < count; i += 1) {
    rects.push({ x: Math.round((view.w - w) / 2), y: y0 + i * (h + gap), w, h });
  }
  return rects;
}

/** The title screen: the game's name over the living city, and its menu. */
export function drawTitleScreen(ctx, world, view, items, menuIndex, showHelp) {
  const grad = ctx.createLinearGradient(0, 0, 0, view.h * 0.62);
  grad.addColorStop(0, 'rgba(8, 16, 24, 0.55)');
  grad.addColorStop(1, 'rgba(8, 16, 24, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.w, view.h * 0.62);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd968';
  ctx.font = '800 21px system-ui, sans-serif';
  ctx.fillText('W E L C O M E   T O', view.w / 2, view.h * 0.24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.fillText('SOLAR BAY', view.w / 2, view.h * 0.24 + 78);
  ctx.fillStyle = '#ff9d6c';
  ctx.fillRect(view.w / 2 - 130, view.h * 0.24 + 94, 260, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'italic 16px system-ui, sans-serif';
  ctx.fillText('a small city of big temptations — steal cars, run jobs, mind the law', view.w / 2, view.h * 0.24 + 124);

  const rects = titleMenuRects(view, items.length);
  items.forEach((item, i) => {
    const r = rects[i];
    const selected = i === menuIndex;
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#0d1b26';
      rr(ctx, r.x, r.y, r.w, r.h, 9);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffd968';
      ctx.lineWidth = 2;
      rr(ctx, r.x, r.y, r.w, r.h, 9);
      ctx.stroke();
    }
    ctx.fillStyle = selected ? '#ffd968' : 'rgba(255,255,255,0.85)';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(item.label, view.w / 2, r.y + 25);
  });

  if (showHelp) {
    const lines = [
      'On foot: WASD move · SHIFT run · F take the nearest car · mouse aim, click to shoot · E talk/skip',
      'In a car: WASD drive · SPACE handbrake · F get out',
      'Follow the gold marker: story missions at Dario\u2019s Garage, courier work between them.',
      'Crime raises your stars. Lose the police to let them fade — or get busted and pay the fine.',
      'P pauses (and S saves there). Progress also saves after every mission.',
    ];
    const w = Math.min(760, view.w - 60);
    const x = (view.w - w) / 2;
    const y = view.h - 178;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#0a141d';
    rr(ctx, x, y, w, 138, 10);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f2f5f7';
    ctx.font = '13.5px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, view.w / 2, y + 30 + i * 22));
  }

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('An original open-world crime game · keyboard and mouse · everything on this page is a local file', view.w / 2, view.h - 14);
  void world;
}

/** A full-screen dim with a title and lines, for menus and endings of a run. */
export function drawOverlay(ctx, view, title, lines, accent = '#ffd968') {
  ctx.fillStyle = 'rgba(6, 12, 18, 0.62)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '800 52px system-ui, sans-serif';
  ctx.fillText(title, view.w / 2, view.h / 2 - 40);
  ctx.fillStyle = '#f2f5f7';
  ctx.font = '16px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, view.w / 2, view.h / 2 + 4 + i * 24));
}
