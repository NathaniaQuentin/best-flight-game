// Procedural terrain for Ember Isles Airlift: rolling hills, seeded mountains kept clear
// of the flight path, lava-gorge walls through the middle stretch, a river valley,
// a smoking volcano east of the gorge, and flat pads under the four runways.
// Deterministic for a fixed seed.

import { WORLD_SEED, PALETTE } from './config.js';
import { hash2, smoothstep, lerp, clamp } from './random.js';
import { pathX, onRunway } from './geometry.js';

/** Smooth value noise over the (x, z) plane, 0..1. */
function noise2(x, z, cell, seed) {
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smoothstep(fx - ix);
  const tz = smoothstep(fz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

/** The seeded mountain peaks: x, z, radius, height. */
const MOUNTAINS = (() => {
  const peaks = [];
  let s = WORLD_SEED;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 11; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    peaks.push({
      x: side * (420 + rnd() * 560),
      z: 200 + rnd() * 5000,
      r: 200 + rnd() * 160,
      h: 70 + rnd() * 55,
    });
  }
  // Mount Ember, the smoking volcano east of the lava gorge: the archipelago's
  // landmark, always in view on the second sortie.
  peaks.push({ x: pathX(2600) + 430, z: 2600, r: 420, h: 175, volcano: true });
  return peaks;
})();

/** Mount Ember's position, for the smoke plume the renderer draws. */
export const VOLCANO = { x: pathX(2600) + 430, z: 2600 };

/** The river's centreline x at distance z. */
export function riverX(z) {
  return -330 + 150 * Math.sin(z * 0.0006 + 0.5);
}

/** Ground height at world (x, z). Water sits at height 2. */
export function heightAt(x, z) {
  // Rolling hills: two noise octaves plus long swells.
  let h = 10 + 15 * noise2(x, z, 260, WORLD_SEED) + 6 * noise2(x, z, 90, WORLD_SEED + 7);
  h += 9 * Math.sin(z * 0.0011 + 1.2) * Math.cos(x * 0.0009);
  // Canyon walls: high ridges either side of the route through the middle stretch.
  if (z > 1250 && z < 2950) {
    const band = smoothstep((z - 1250) / 120) * (1 - smoothstep((z - 2830) / 120));
    const d = Math.abs(x - pathX(z));
    const ridge = Math.exp(-Math.pow((d - 165) / 75, 2));
    h += 68 * ridge * band;
  }
  // Mountains, faded out near the flight path so the route stays flyable.
  const corridor = Math.abs(x - pathX(z));
  const clear = smoothstep((corridor - 150) / 160);
  for (const m of MOUNTAINS) {
    const dx = x - m.x;
    const dz = z - m.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < m.r * m.r * 4) {
      const fall = Math.exp(-dist2 / (m.r * m.r));
      h += m.h * fall * clear;
    }
  }
  // River valley: carve down toward the waterline near the river.
  const rd = Math.abs(x - riverX(z));
  if (rd < 90) h = lerp(2.5, h, smoothstep(rd / 90));
  // Runway pads are flat.
  const pad = onRunway(x, z);
  if (pad) h = lerp(h, 4, 0.92);
  return h;
}

/** Water level: ground below this is water. */
export const WATER_LEVEL = 3.2;

/** Terrain colour for a height, with a field checker for farmland texture. */
export function terrainColor(x, z, h) {
  if (h < WATER_LEVEL + 0.4) return PALETTE.water;
  if (h > 96) return PALETTE.snow;
  if (h > 58) return PALETTE.rock;
  const field = (Math.floor(x / 130) + Math.floor(z / 130)) % 2 === 0;
  const base = field ? PALETTE.grassLow : PALETTE.fieldAlt;
  const high = PALETTE.grassHigh;
  const t = clamp((h - 4) / 55, 0, 1);
  return mixHex(base, high, t * 0.7);
}

/** Mix two #rrggbb colours by t (0..1). */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Mix an rgb() colour string toward the horizon haze by t (0..1). */
export function haze(color, t) {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color);
  if (!m) return color;
  const r = Math.round(lerp(Number(m[1]), 232, t));
  const g = Math.round(lerp(Number(m[2]), 190, t));
  const b = Math.round(lerp(Number(m[3]), 150, t));
  return `rgb(${r},${g},${b})`;
}
