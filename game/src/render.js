// Renderer for Ember Isles Airlift: sky, software-3D terrain, rings, crates, balloons,
// clouds, runway, the chase-view aircraft and the lit HUD instruments.
// Everything is drawn on one 2D canvas; no images, no network.

import { VIEW, PALETTE, SKIES, MISSIONS, COURSE, UPGRADES } from './config.js';
import { clamp, lerp } from './random.js';
import { heightAt, terrainColor, haze, VOLCANO } from './terrain.js';
import { regionAt, REGION_NAMES, RUNWAYS } from './geometry.js';
import { nextRing, ringsRemaining } from './course.js';

const ROWS = 26;
const ROW_START = 24;
const ROW_STEP = 17;
const COLS = 21;
const COL_STEP = 28;

/** Camera behind and above the plane, looking ahead down the route. */
export function cameraFor(plane) {
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  const pos = {
    x: plane.x - fx * 24,
    y: plane.y + 7.5,
    z: plane.z - fz * 24,
  };
  const look = {
    x: plane.x + fx * 60,
    y: plane.y - 3.5,
    z: plane.z + fz * 60,
  };
  const fwd = norm3(look.x - pos.x, look.y - pos.y, look.z - pos.z);
  // Screen-right: east (+x) when facing north (+z), turning with the heading.
  const right = norm3(fwd.z, 0, -fwd.x);
  // Up completes the basis: fwd x right.
  const up = cross3(fwd, right);
  const focal = (VIEW.height / 2) / Math.tan((62 * Math.PI) / 360);
  return { pos, fwd, right, up, focal };
}

function norm3(x, y, z) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Project a world point into screen space; null when behind the camera. */
function project(cam, x, y, z) {
  const dx = x - cam.pos.x;
  const dy = y - cam.pos.y;
  const dz = z - cam.pos.z;
  const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (cz < 2) return null;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return {
    x: VIEW.width / 2 + (cam.focal * cx) / cz,
    y: VIEW.height * 0.55 - (cam.focal * cy) / cz,
    depth: cz,
  };
}

/** Small helpers for HUD text and panels. */
function text(ctx, s, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.strokeStyle = 'rgba(160, 210, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

/** The whole frame: sky, terrain, objects, aircraft, HUD, then the screen overlay. */
export function render(ctx, plane, run, timeMs) {
  const cam = cameraFor(plane);
  drawSky(ctx, plane, run, timeMs);
  drawTerrainAndObjects(ctx, plane, run, cam, timeMs);
  drawPlaneShadow(ctx, plane, cam);
  drawPlane(ctx, plane, timeMs);
  drawHUD(ctx, plane, run, timeMs);
  drawOverlay(ctx, plane, run, timeMs);
}

function drawSky(ctx, plane, run, timeMs) {
  const region = regionAt(plane.z);
  // One sky per sortie: dawn, golden hour, dusk storm.
  const sky = SKIES[run.mission] || SKIES[0];
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, sky.skyTop);
  g.addColorStop(0.55, sky.skyMid);
  g.addColorStop(0.8, sky.skyHorizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Sun low on the horizon, ahead-left.
  const sunX = VIEW.width * 0.3 - plane.heading * 120;
  const sunY = sky.sunY;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  glow.addColorStop(0, 'rgba(255, 217, 160, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 190, 120, 0.45)');
  glow.addColorStop(1, 'rgba(255, 190, 120, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
  ctx.fillStyle = sky.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 20, 0, Math.PI * 2);
  ctx.fill();
  // Distant cloud bands, drifting slowly with the heading.
  ctx.fillStyle = 'rgba(255, 244, 230, 0.5)';
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 211 - plane.heading * 260) % (VIEW.width + 240) + VIEW.width + 240) % (VIEW.width + 240) - 120;
    const cy = 52 + ((i * 37) % 90);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 64 + (i % 3) * 22, 10 + (i % 2) * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Storm darkening when inside the storm stretch.
  if (region === 'storm') {
    ctx.fillStyle = 'rgba(20, 26, 40, 0.18)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

/** Terrain grid far-to-near with rings, crates, balloons, clouds and runways interleaved. */
function drawTerrainAndObjects(ctx, plane, run, cam, timeMs) {
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  const rx = Math.cos(plane.heading);
  const rz = -Math.sin(plane.heading);
  // Project the grid once.
  const grid = [];
  for (let r = 0; r <= ROWS; r++) {
    const depth = ROW_START + r * ROW_STEP;
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const lateral = (c - (COLS - 1) / 2) * COL_STEP;
      const wx = plane.x + fx * depth + rx * lateral;
      const wz = plane.z + fz * depth + rz * lateral;
      const wy = heightAt(wx, wz);
      const p = project(cam, wx, wy, wz);
      row.push({ p, x: wx, z: wz, h: wy, depth });
    }
    grid.push(row);
  }
  // Bucket the objects by row so they draw in depth order with the terrain.
  const buckets = Array.from({ length: ROWS + 1 }, () => []);
  const bucketFor = (depth) => clamp(Math.round((depth - ROW_START) / ROW_STEP), 0, ROWS);
  const fwdX = fx;
  const fwdZ = fz;
  const depthOf = (x, z) => (x - plane.x) * fwdX + (z - plane.z) * fwdZ;
  for (const ring of run.course.rings) {
    if (ring.passed) continue;
    buckets[bucketFor(depthOf(ring.x, ring.z))].push({ kind: 'ring', obj: ring });
  }
  for (const b of run.course.bonusRings) {
    if (b.passed) continue;
    buckets[bucketFor(depthOf(b.x, b.z))].push({ kind: 'bonus', obj: b });
  }
  for (const crate of run.course.crates) {
    if (crate.taken) continue;
    buckets[bucketFor(depthOf(crate.x, crate.z))].push({ kind: 'crate', obj: crate });
  }
  for (const b of run.course.balloons) {
    if (b.hit) continue;
    buckets[bucketFor(depthOf(b.x, b.z))].push({ kind: 'balloon', obj: b, t: timeMs });
  }
  for (const c of run.course.clouds) {
    buckets[bucketFor(depthOf(c.x, c.z))].push({ kind: 'cloud', obj: c });
  }
  for (const r of RUNWAYS) {
    buckets[bucketFor(depthOf(r.x, r.z))].push({ kind: 'runway', obj: r });
  }
  // Mount Ember's smoke plume, drifting over the volcano east of the gorge.
  buckets[bucketFor(depthOf(VOLCANO.x, VOLCANO.z))].push({ kind: 'smoke', obj: VOLCANO, t: timeMs });
  // Far to near: row quads, then the objects standing on that row.
  for (let r = ROWS; r >= 0; r--) {
    if (r < ROWS) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = grid[r][c];
        const b = grid[r][c + 1];
        const d = grid[r + 1][c + 1];
        const e = grid[r + 1][c];
        if (!a.p || !b.p || !d.p || !e.p) continue;
        const midH = (a.h + b.h + d.h + e.h) / 4;
        const midX = (a.x + b.x + d.x + e.x) / 4;
        const midZ = (a.z + b.z + d.z + e.z) / 4;
        let color = terrainColor(midX, midZ, midH);
        const hazeT = clamp((a.depth - 80) / 380, 0, 0.75);
        color = haze(color, hazeT);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.lineTo(e.p.x, e.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const item of buckets[r]) drawObject(ctx, cam, item, timeMs);
  }
}

function drawObject(ctx, cam, item, timeMs) {
  if (item.kind === 'ring') {
    const ring = item.obj;
    const p = project(cam, ring.x, ring.y, ring.z);
    if (!p) return;
    const rs = (cam.focal * ring.radius) / p.depth;
    if (rs < 2) return;
    ctx.save();
    ctx.shadowColor = ring.fuel ? PALETTE.fuelRing : PALETTE.ringGlow;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = ring.fuel ? PALETTE.fuelRing : PALETTE.ring;
    ctx.lineWidth = Math.max(2, rs * 0.16);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rs, rs * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(20, 20, 30, 0.55)';
    ctx.lineWidth = Math.max(1, rs * 0.05);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rs * 0.82, rs * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, `R${ring.index + 1}`, p.x, p.y - rs - 12, 15, ring.fuel ? PALETTE.fuelRing : PALETTE.ringGlow, 'center');
    return;
  }
  if (item.kind === 'bonus') {
    const b = item.obj;
    const p = project(cam, b.x, b.y, b.z);
    if (!p) return;
    const rs = (cam.focal * 15) / p.depth;
    if (rs < 2) return;
    ctx.save();
    ctx.shadowColor = '#c98aff';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#b06bff';
    ctx.lineWidth = Math.max(2, rs * 0.16);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rs, rs * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text(ctx, 'B', p.x, p.y - rs - 12, 15, '#d9aaff', 'center');
    return;
  }
  if (item.kind === 'crate') {
    const c = item.obj;
    const p = project(cam, c.x, c.y, c.z);
    if (!p) return;
    const s = Math.max(3, (cam.focal * 7) / p.depth);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.crate;
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.strokeStyle = '#a33327';
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.3, p.y);
    ctx.lineTo(p.x + s * 0.3, p.y);
    ctx.moveTo(p.x, p.y - s * 0.3);
    ctx.lineTo(p.x, p.y + s * 0.3);
    ctx.stroke();
    return;
  }
  if (item.kind === 'balloon') {
    const b = item.obj;
    const bob = Math.sin(timeMs / 700 + b.bob) * 3;
    const p = project(cam, b.x, b.y + bob, b.z);
    if (!p) return;
    const rs = Math.max(3, (cam.focal * 9) / p.depth);
    ctx.fillStyle = PALETTE.balloon;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rs, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(p.x - rs * 0.3, p.y - rs * 0.35, rs * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,20,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + rs);
    ctx.lineTo(p.x, p.y + rs * 1.7);
    ctx.stroke();
    return;
  }
  if (item.kind === 'cloud') {
    const c = item.obj;
    const p = project(cam, c.x, c.y, c.z);
    if (!p) return;
    const rs = Math.max(6, (cam.focal * c.r) / p.depth);
    ctx.fillStyle = 'rgba(235, 238, 245, 0.75)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rs, rs * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - rs * 0.45, p.y + rs * 0.08, rs * 0.6, rs * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + rs * 0.45, p.y + rs * 0.08, rs * 0.6, rs * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (item.kind === 'smoke') {
    const v = item.obj;
    const peakY = heightAt(v.x, v.z);
    const drift = Math.sin(item.t / 2400) * 14;
    for (let i = 0; i < 5; i++) {
      const p = project(cam, v.x + drift * (i + 1) * 0.6, peakY + 24 + i * 26, v.z);
      if (!p) return;
      const rs = Math.max(4, (cam.focal * (16 + i * 9)) / p.depth);
      ctx.fillStyle = `rgba(120, 118, 128, ${0.5 - i * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rs, rs * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (item.kind === 'runway') {
    const r = item.obj;
    const half = r.length / 2;
    const wHalf = r.width / 2;
    const corners = [
      [r.x + Math.sin(r.heading) * -half + Math.cos(r.heading) * -wHalf, r.z + Math.cos(r.heading) * -half - Math.sin(r.heading) * -wHalf],
      [r.x + Math.sin(r.heading) * -half + Math.cos(r.heading) * wHalf, r.z + Math.cos(r.heading) * -half - Math.sin(r.heading) * wHalf],
      [r.x + Math.sin(r.heading) * half + Math.cos(r.heading) * wHalf, r.z + Math.cos(r.heading) * half - Math.sin(r.heading) * wHalf],
      [r.x + Math.sin(r.heading) * half + Math.cos(r.heading) * -wHalf, r.z + Math.cos(r.heading) * half - Math.sin(r.heading) * -wHalf],
    ];
    const pts = corners.map(([x, z]) => project(cam, x, heightAt(x, z) + 0.6, z));
    if (pts.some((p) => !p)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = PALETTE.runwayLine;
    for (let d = -half + 18; d < half - 10; d += 36) {
      const x1 = r.x + Math.sin(r.heading) * d;
      const z1 = r.z + Math.cos(r.heading) * d;
      const x2 = r.x + Math.sin(r.heading) * (d + 16);
      const z2 = r.z + Math.cos(r.heading) * (d + 16);
      const a = project(cam, x1 - Math.cos(r.heading) * 1.2, heightAt(x1, z1) + 0.8, z1 + Math.sin(r.heading) * 1.2);
      const b = project(cam, x1 + Math.cos(r.heading) * 1.2, heightAt(x1, z1) + 0.8, z1 - Math.sin(r.heading) * 1.2);
      const c2 = project(cam, x2 + Math.cos(r.heading) * 1.2, heightAt(x2, z2) + 0.8, z2 - Math.sin(r.heading) * 1.2);
      const d2 = project(cam, x2 - Math.cos(r.heading) * 1.2, heightAt(x2, z2) + 0.8, z2 + Math.sin(r.heading) * 1.2);
      if (!a || !b || !c2 || !d2) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Soft shadow of the plane on the ground below it, showing altitude at a glance. */
function drawPlaneShadow(ctx, plane, cam) {
  const ground = heightAt(plane.x, plane.z);
  const p = project(cam, plane.x, ground + 0.8, plane.z);
  if (!p || plane.y - ground > 260) return;
  const s = clamp((cam.focal * 16) / p.depth, 4, 46) * (1 - (plane.y - ground) / 320);
  ctx.fillStyle = 'rgba(10, 14, 20, 0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The courier plane in chase view, banked with the stick, engines glowing. */
function drawPlane(ctx, plane, timeMs) {
  const cx = VIEW.width / 2;
  const cy = VIEW.height * 0.62;
  const span = 132;
  const flicker = 0.75 + Math.sin(timeMs / 90) * 0.25;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank * 0.9);
  // Engine glow.
  ctx.fillStyle = `rgba(255, ${Math.round(140 + 60 * flicker)}, 40, ${0.55 * flicker * plane.throttle})`;
  ctx.beginPath();
  ctx.ellipse(0, 26, 10, 16 + 10 * plane.throttle * flicker, 0, 0, Math.PI * 2);
  ctx.fill();
  // Main wings.
  ctx.fillStyle = '#dfe6ee';
  ctx.strokeStyle = '#5a6b7d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-span / 2, 6);
  ctx.lineTo(-14, -4);
  ctx.lineTo(14, -4);
  ctx.lineTo(span / 2, 6);
  ctx.lineTo(span / 2 - 14, 14);
  ctx.lineTo(-span / 2 + 14, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Tail wings.
  ctx.fillStyle = '#b9c4d1';
  ctx.beginPath();
  ctx.moveTo(-34, 30);
  ctx.lineTo(-8, 24);
  ctx.lineTo(8, 24);
  ctx.lineTo(34, 30);
  ctx.lineTo(22, 36);
  ctx.lineTo(-22, 36);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  const fg = ctx.createLinearGradient(-10, 0, 10, 0);
  fg.addColorStop(0, '#8fa3b5');
  fg.addColorStop(0.5, '#f4f7fa');
  fg.addColorStop(1, '#8fa3b5');
  ctx.fillStyle = fg;
  ctx.strokeStyle = '#5a6b7d';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.quadraticCurveTo(11, -12, 9, 30);
  ctx.quadraticCurveTo(0, 38, -9, 30);
  ctx.quadraticCurveTo(-11, -12, 0, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Canopy.
  ctx.fillStyle = '#1d4e7a';
  ctx.beginPath();
  ctx.ellipse(0, -14, 5.5, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190, 225, 255, 0.8)';
  ctx.beginPath();
  ctx.ellipse(-1.5, -18, 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Orange courier stripe + tail fin.
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(-9, 8, 18, 4);
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(-7, 40);
  ctx.lineTo(7, 40);
  ctx.closePath();
  ctx.fillStyle = '#ff7a1a';
  ctx.fill();
  // Navigation lights, blinking.
  const blink = Math.sin(timeMs / 260) > 0;
  if (blink) {
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-span / 2 + 2, 8, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.arc(span / 2 - 2, 8, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Lit instruments: altitude, speed, heading, fuel, hull, throttle, horizon, needle. */
function drawHUD(ctx, plane, run, timeMs) {
  // Top-left: flight instruments.
  panel(ctx, 14, 12, 250, 92);
  const altFt = Math.round(plane.y * 3.2);
  const spdKt = Math.round(plane.speed * 1.9);
  const hdg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
  text(ctx, 'ALT', 28, 30, 12, PALETTE.hudAmber);
  text(ctx, `${altFt} ft`, 28, 52, 22, PALETTE.hudInk);
  text(ctx, 'SPD', 128, 30, 12, PALETTE.hudAmber);
  text(ctx, `${spdKt} kt`, 128, 52, 22, PALETTE.hudInk);
  text(ctx, 'HDG', 214, 30, 12, PALETTE.hudAmber);
  text(ctx, `${String(hdg).padStart(3, '0')}°`, 214, 52, 22, PALETTE.hudInk);
  // Compass tape.
  ctx.save();
  ctx.beginPath();
  ctx.rect(24, 70, 230, 26);
  ctx.clip();
  for (let d = -180; d <= 180; d += 15) {
    const deg = ((hdg + d) % 360 + 360) % 360;
    const x = 139 + d * 1.35;
    const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : deg % 45 === 0 ? String(deg) : '';
    ctx.strokeStyle = 'rgba(207, 232, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(x, 74);
    ctx.lineTo(x, 82);
    ctx.stroke();
    if (label) text(ctx, label, x, 90, 11, PALETTE.hudInk, 'center');
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(139, 70);
  ctx.lineTo(139, 96);
  ctx.stroke();

  // Top-right: mission, rings, score, time, parts and upgrades.
  panel(ctx, VIEW.width - 264, 12, 250, 112);
  const mission = MISSIONS[run.mission];
  text(ctx, mission.name.toUpperCase(), VIEW.width - 250, 30, 13, PALETTE.hudAmber);
  text(ctx, `RINGS  ${run.ringsPassed}/18  ·  LEFT ${ringsRemaining(run)}`, VIEW.width - 250, 52, 15, PALETTE.hudInk);
  text(ctx, `SCORE  ${run.score}`, VIEW.width - 250, 74, 15, PALETTE.hudInk);
  const t = Math.max(0, Math.ceil(run.timeLeft));
  const timeColor = t < 20 ? PALETTE.hudRed : PALETTE.hudInk;
  text(ctx, `TIME  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}   ·   ${REGION_NAMES[regionAt(plane.z)].toUpperCase()}`, VIEW.width - 250, 92, 15, timeColor);
  const up = run.upgrades || { engine: 0, tanks: 0, armour: 0, agility: 0 };
  text(ctx, `PARTS ${run.parts}  ·  ENG ${up.engine} TAN ${up.tanks} ARM ${up.armour} AGI ${up.agility}`, VIEW.width - 250, 112, 13, PALETTE.hudInk);

  // Bottom-left: artificial horizon.
  const hx = 52;
  const hy = VIEW.height - 52;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, 34, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-plane.bank);
  ctx.translate(0, clamp(plane.pitch * 90, -26, 26));
  ctx.fillStyle = '#3f6ea6';
  ctx.fillRect(-40, -40, 80, 40);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-40, 0, 80, 40);
  ctx.restore();
  ctx.strokeStyle = 'rgba(207, 232, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx - 34, hy);
  ctx.lineTo(hx + 34, hy);
  ctx.stroke();
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy - 4);
  ctx.lineTo(hx + 6, hy - 4);
  ctx.lineTo(hx, hy + 2);
  ctx.closePath();
  ctx.fill();
  text(ctx, 'ATT', hx, hy + 48, 11, PALETTE.hudAmber, 'center');

  // Bottom-right: fuel, hull, throttle bars.
  panel(ctx, VIEW.width - 264, VIEW.height - 86, 250, 72);
  bar(ctx, VIEW.width - 250, VIEW.height - 72, 222, 10, plane.fuel / plane.fuelMax, plane.fuel < 25 ? PALETTE.hudRed : PALETTE.hudGreen, 'FUEL');
  bar(ctx, VIEW.width - 250, VIEW.height - 50, 222, 10, plane.hull / plane.hullMax, plane.hull < 35 ? PALETTE.hudRed : PALETTE.hudInk, 'HULL');
  bar(ctx, VIEW.width - 250, VIEW.height - 28, 222, 10, plane.throttle, PALETTE.hudAmber, 'THR');

  // Centre: needle toward the next ring + distance.
  const ring = nextRing(run);
  if (ring && run.phase === 'fly') {
    const cam = cameraFor(plane);
    const p = project(cam, ring.x, ring.y, ring.z);
    const dx = ring.x - plane.x;
    const dy = ring.y - plane.y;
    const dz = ring.z - plane.z;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
    if (p && p.x > 40 && p.x < VIEW.width - 40 && p.y > 40 && p.y < VIEW.height - 40) {
      ctx.strokeStyle = PALETTE.ringGlow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Off-screen: an edge arrow pointing at it.
      const ang = Math.atan2((p ? p.y : VIEW.height / 2) - VIEW.height / 2, (p ? p.x : VIEW.width / 2) - VIEW.width / 2);
      const ax = VIEW.width / 2 + Math.cos(ang) * 190;
      const ay = VIEW.height / 2 + Math.sin(ang) * 110;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.ring;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    text(ctx, `NEXT RING  ${dist}m`, VIEW.width / 2, 26, 15, PALETTE.ringGlow, 'center');
  }

  // Fresh message banner (not on the landed screen — it shows the medal there).
  if (run.message && run.phase !== 'landed' && run.elapsed - run.messageAt < 3) {
    const alpha = run.elapsed - run.messageAt > 2.4 ? 0.35 : 1;
    ctx.globalAlpha = alpha;
    text(ctx, run.message, VIEW.width / 2, 116, 20, PALETTE.hudInk, 'center');
    ctx.globalAlpha = 1;
  }
  // Low fuel warning.
  if (plane.fuel < 25 && run.phase === 'fly' && Math.sin(timeMs / 200) > 0) {
    text(ctx, 'LOW FUEL — FIND A GREEN RING', VIEW.width / 2, 142, 16, PALETTE.hudRed, 'center');
  }
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  text(ctx, label, x, y + h / 2, 10, '#0a1420', 'left');
}

/** Title, pause, landed, win and game-over screens, drawn over the scene. */
function drawOverlay(ctx, plane, run, timeMs) {
  if (run.phase === 'fly') return;
  ctx.fillStyle = 'rgba(6, 12, 22, 0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const cx = VIEW.width / 2;
  if (run.phase === 'title') {
    text(ctx, 'EMBER ISLES AIRLIFT', cx, 108, 44, '#f5f2e8', 'center');
    text(ctx, '18 rings  ·  6 bonus rings  ·  3 sorties  ·  12 crates  ·  4 upgrades  ·  3 medals  ·  3 skies', cx, 148, 18, PALETTE.ringGlow, 'center');
    text(ctx, 'Fly the Ember Coast, thread the lava gorge, beat the ash storm — then land it.', cx, 178, 16, PALETTE.hudInk, 'center');
    text(ctx, 'ARROWS / WASD — pitch & bank      SHIFT / CTRL — throttle      SPACE — boost      MOUSE — steer', cx, 232, 15, PALETTE.hudInk, 'center');
    text(ctx, 'Green rings refuel  ·  Violet bonus rings +150  ·  Red balloons cost hull  ·  Crates carry spare parts', cx, 258, 15, PALETTE.hudInk, 'center');
    text(ctx, 'Land to finish a sortie — then spend parts on upgrades (keys 1-4) before the next one', cx, 282, 15, PALETTE.hudInk, 'center');
    text(ctx, 'P pause      M sound      R restart', cx, 308, 14, 'rgba(207,232,255,0.7)', 'center');
    const pulse = 0.6 + Math.sin(timeMs / 350) * 0.4;
    ctx.globalAlpha = pulse;
    text(ctx, 'PRESS ENTER TO FLY', cx, 360, 22, PALETTE.hudAmber, 'center');
    ctx.globalAlpha = 1;
    return;
  }
  if (run.phase === 'paused') {
    text(ctx, 'PAUSED', cx, 200, 40, PALETTE.hudInk, 'center');
    text(ctx, 'Press P to keep flying', cx, 250, 16, 'rgba(207,232,255,0.7)', 'center');
    return;
  }
  if (run.phase === 'landed') {
    const medal = run.medals[run.mission - 1];
    text(ctx, 'SORTIE COMPLETE', cx, 140, 36, PALETTE.hudGreen, 'center');
    text(ctx, MISSIONS[run.mission - 1].name, cx, 176, 18, PALETTE.hudInk, 'center');
    if (medal) text(ctx, `${medal.toUpperCase()} MEDAL`, cx, 206, 22, PALETTE.ringGlow, 'center');
    text(ctx, `Score  ${run.score}    Rings  ${run.ringsPassed}/18    Crates  ${run.cratesTaken}/12`, cx, 236, 16, PALETTE.hudInk, 'center');
    // Upgrade shop: spare parts earned from crates, 2 parts per level.
    text(ctx, `SPARE PARTS  ${run.parts}  —  press 1-4 to install (2 parts each):`, cx, 268, 15, PALETTE.hudAmber, 'center');
    UPGRADES.forEach((up, i) => {
      const level = (run.upgrades || {})[up.id] || 0;
      const status = level >= up.max ? 'MAXED' : run.parts < up.cost ? 'NEED 2 PARTS' : '2 PARTS';
      const pips = '●'.repeat(level) + '○'.repeat(up.max - level);
      text(ctx, `${i + 1} — ${up.name.toUpperCase()}  ·  ${up.desc}  ·  ${pips}  ·  ${status}`, cx, 292 + i * 20, 15, PALETTE.hudInk, 'center');
    });
    text(ctx, `Next: ${MISSIONS[run.mission].name} — press ENTER to take off`, cx, 392, 16, PALETTE.hudAmber, 'center');
    return;
  }
  if (run.phase === 'win') {
    text(ctx, 'FLIGHT COMPLETE', cx, 130, 40, PALETTE.ringGlow, 'center');
    text(ctx, 'All three sorties flown. Ember Isles Airlift delivers.', cx, 172, 17, PALETTE.hudInk, 'center');
    const medals = run.medals.map((m) => (m ? m.toUpperCase() : '—')).join('   ·   ');
    text(ctx, `Medals:  ${medals}`, cx, 212, 18, PALETTE.hudInk, 'center');
    text(ctx, `Final score  ${run.score}     Rings  ${run.ringsPassed}/18     Crates  ${run.cratesTaken}/12     Parts  ${run.parts}`, cx, 246, 17, PALETTE.hudInk, 'center');
    text(ctx, 'PRESS ENTER TO FLY AGAIN', cx, 300, 20, PALETTE.hudAmber, 'center');
    return;
  }
  if (run.phase === 'over') {
    text(ctx, 'MISSION FAILED', cx, 160, 40, PALETTE.hudRed, 'center');
    text(ctx, run.reason || 'The flight is over.', cx, 208, 18, PALETTE.hudInk, 'center');
    text(ctx, `Score  ${run.score}     Rings  ${run.ringsPassed}/18`, cx, 246, 16, PALETTE.hudInk, 'center');
    text(ctx, 'PRESS ENTER TO TRY AGAIN', cx, 296, 20, PALETTE.hudAmber, 'center');
  }
}
