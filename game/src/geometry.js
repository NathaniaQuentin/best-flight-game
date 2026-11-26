// Shared course geometry for Ember Isles Airlift: the flight path every module agrees on.
// The route runs north (+Z) from the home runway, bending gently east and west.
// Rings sit along it every 225 units; a runway waits at the end of each sortie.

import { COURSE } from './config.js';

/** The route's centreline: lateral x for a given distance north z. */
export function pathX(z) {
  return 240 * Math.sin(z * 0.00045) + 90 * Math.sin(z * 0.0011 + 1.7);
}

/** The route's heading (radians from +Z) at distance z, from the centreline's slope. */
export function pathHeading(z) {
  const dx = (pathX(z + 4) - pathX(z - 4)) / 8;
  return Math.atan(dx);
}

/** Distance north of ring i (0-based, 18 rings in all). Each sortie's rings sit
 * between its departure and arrival runways, with a gap at every runway. */
export function ringZ(i) {
  const gap = i >= 10 ? 450 : i >= 4 ? 225 : 0;
  return 300 + i * COURSE.ringSpacing + gap;
}

/** Which region a distance north belongs to: valley, canyon or storm. */
export function regionAt(z) {
  if (z < 1300) return 'valley';
  if (z < 2900) return 'canyon';
  return 'storm';
}

/** Display names for the regions, for the HUD. */
export const REGION_NAMES = {
  valley: 'Ember Coast',
  canyon: 'Lava Gorge',
  storm: 'Ash Storm',
};

/** The four runway pads: the home strip, then one at the end of each sortie. */
export const RUNWAYS = [
  { z: 0, name: 'Home Strip — Ember Field' },
  { z: 1200, name: 'Runway 09 — Cinder Strip' },
  { z: 2775, name: 'Runway 27 — Ashfall Strip' },
  { z: 4800, name: 'Runway 09 — Stormhaven' },
].map((r) => ({
  ...r,
  x: pathX(r.z),
  heading: pathHeading(r.z),
  length: COURSE.runwayLength,
  width: COURSE.runwayWidth,
}));

/** True when (x, z) lies on a runway pad (used to flatten the terrain there). */
export function onRunway(x, z) {
  for (const r of RUNWAYS) {
    const dx = x - r.x;
    const dz = z - r.z;
    const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    if (Math.abs(along) < r.length / 2 + 12 && Math.abs(across) < r.width / 2 + 12) return r;
  }
  return null;
}
