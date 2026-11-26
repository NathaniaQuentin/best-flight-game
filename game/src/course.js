// The course for Ember Isles Airlift: 18 rings, 6 violet bonus rings off the route,
// 12 supply crates, hazard balloons, storm clouds and the four runway pads,
// generated deterministically from the seed.
// Also tracks mission progress, score and medals.

import { WORLD_SEED, MISSIONS, COURSE, SCORE } from './config.js';
import { mulberry32 } from './random.js';
import { pathX, ringZ } from './geometry.js';
import { heightAt } from './terrain.js';

/** Build the whole course once: rings, crates, balloons, clouds. */
export function buildCourse() {
  const rnd = mulberry32(WORLD_SEED);
  const rings = [];
  for (let i = 0; i < 18; i++) {
    const z = ringZ(i);
    const x = pathX(z) + (rnd() - 0.5) * 22;
    const ground = heightAt(x, z);
    // The last ring of each sortie sits low: a final low pass that sets the
    // plane up on the glide path to the runway waiting just ahead.
    const isFinal = i === 3 || i === 9 || i === 17;
    const y = isFinal ? ground + 26 + rnd() * 8 : ground + 58 + rnd() * 34;
    const mission = i < 4 ? 0 : i < 10 ? 1 : 2;
    rings.push({
      index: i,
      mission,
      x,
      y,
      z,
      radius: COURSE.ringRadius,
      fuel: i === 5 || i === 12, // two green fuel rings on the long sorties
      passed: false,
    });
  }
  const crates = [];
  for (let i = 0; i < 12; i++) {
    const z = 420 + i * 360 + rnd() * 120;
    const x = pathX(z) + (rnd() - 0.5) * 120;
    const y = heightAt(x, z) + 42 + rnd() * 26;
    crates.push({ x, y, z, taken: false });
  }
  // Six violet bonus rings off the route: detours for pilots who want the extra
  // points. They never block the sortie — the chain runs without them.
  const bonusRings = [];
  const bonusZ = [700, 1600, 2500, 3400, 4300, 4700];
  for (let i = 0; i < 6; i++) {
    const z = bonusZ[i];
    const side = i % 2 === 0 ? -1 : 1;
    const x = pathX(z) + side * (95 + rnd() * 65);
    const y = heightAt(x, z) + 62 + rnd() * 38;
    bonusRings.push({ x, y, z, passed: false });
  }
  const balloons = [];
  for (let i = 0; i < 10; i++) {
    const ring = rings[2 + Math.floor(rnd() * 15)];
    const x = ring.x + (rnd() < 0.5 ? -1 : 1) * (34 + rnd() * 40);
    const y = ring.y + (rnd() - 0.5) * 44;
    balloons.push({ x, y, z: ring.z + (rnd() - 0.5) * 60, hit: false, bob: rnd() * 6.28 });
  }
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const z = 2950 + rnd() * 1900;
    const x = pathX(z) + (rnd() - 0.5) * 700;
    const y = 95 + rnd() * 90;
    clouds.push({ x, y, z, r: 55 + rnd() * 70 });
  }
  return { rings, bonusRings, crates, balloons, clouds };
}

/** Fresh run state for a new flight. */
export function newRun(course) {
  return {
    course,
    mission: 0,
    phase: 'title', // title | fly | landed | win | over
    score: 0,
    ringsPassed: 0,
    cratesTaken: 0,
    parts: 0, // spare parts: one per crate, spent on aircraft upgrades
    upgrades: { engine: 0, tanks: 0, armour: 0, agility: 0 },
    timeLeft: MISSIONS[0].timeLimit,
    missionScore: 0,
    missionDamage: false,
    medals: [null, null, null],
    message: '',
    messageAt: 0,
    reason: '',
    elapsed: 0,
  };
}

/** The next ring the pilot must fly through, or null when the sortie is done. */
export function nextRing(run) {
  const from = [0, 4, 10][run.mission];
  const to = [4, 10, 18][run.mission];
  for (let i = from; i < to; i++) {
    if (!run.course.rings[i].passed) return run.course.rings[i];
  }
  return null;
}

/** Rings still to fly in the current sortie. */
export function ringsRemaining(run) {
  const from = [0, 4, 10][run.mission];
  const to = [4, 10, 18][run.mission];
  let n = 0;
  for (let i = from; i < to; i++) if (!run.course.rings[i].passed) n++;
  return n;
}

/** Award points and show a message. */
export function award(run, points, text) {
  run.score += points;
  run.missionScore += points;
  run.message = text;
  run.messageAt = run.elapsed;
}

/** Medal for a mission score, or null. */
export function medalFor(mission, score) {
  const m = MISSIONS[mission].medal;
  if (score >= m.gold) return 'gold';
  if (score >= m.silver) return 'silver';
  if (score >= m.bronze) return 'bronze';
  return null;
}

/** Finish a sortie after landing: time bonus, no-damage bonus, medal. */
export function completeMission(run) {
  const timeBonus = Math.round(run.timeLeft) * SCORE.timeBonusPerSecond;
  if (timeBonus > 0) award(run, timeBonus, `Landing +${SCORE.landing}  ·  time bonus +${timeBonus}`);
  else award(run, 0, `Landing +${SCORE.landing}`);
  run.score += SCORE.landing;
  run.missionScore += SCORE.landing;
  if (!run.missionDamage) {
    run.score += SCORE.noDamageBonus;
    run.missionScore += SCORE.noDamageBonus;
  }
  const medal = medalFor(run.mission, run.missionScore);
  run.medals[run.mission] = medal;
  if (medal) {
    const bonus = SCORE.medalBonus[medal];
    run.score += bonus;
    run.message = `${medal.toUpperCase()} MEDAL  ·  +${bonus} bonus`;
  }
  return medal;
}
