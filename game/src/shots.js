// Screenshot scenes for Meridian Airlift: each one plays the real rules forward
// from a fresh world for a fixed time, steered by an autopilot that aims at the
// next ring (or the runway, once the rings are done), so every frame is what a
// short game really looks like — and the same seed always gives the same frame.

import { COURSE, MISSIONS } from './config.js';
import { heightAt } from './terrain.js';
import { RUNWAYS } from './geometry.js';
import { nextRing } from './course.js';
import { stepFlight, placeOnRunway, headingTo, headingError } from './flight.js';
import { clamp } from './random.js';

const STEP = 1 / 60;
const START_SECONDS = 4;
const PLAY_SECONDS = 14;
const CANYON_SECONDS = 12;
const END_LIMIT_SECONDS = 180;

/** Autopilot input for one step: steer at the next ring, or land on the runway. */
export function autopilotInput(plane, run) {
  const ring = nextRing(run);
  let targetX;
  let targetY;
  let targetZ;
  let targetHeading;
  let landing = false;
  if (ring) {
    // Follow the route line into the ring: the segment from the previous ring
    // (or the departure runway) to this one, steering back onto the line by
    // the cross-track error. Aiming straight at the ring itself orbits it.
    const prev = ring.index === 0
      ? RUNWAYS[0]
      : ring.index === 4
        ? RUNWAYS[1]
        : ring.index === 10
          ? RUNWAYS[2]
          : run.course.rings[ring.index - 1];
    const segX = ring.x - prev.x;
    const segZ = ring.z - prev.z;
    const segLen = Math.hypot(segX, segZ) || 1;
    const segH = Math.atan2(segX, segZ);
    const relX = plane.x - prev.x;
    const relZ = plane.z - prev.z;
    const cross = (relX * segZ - relZ * segX) / segLen;
    const along = (relX * segX + relZ * segZ) / segLen;
    targetX = ring.x;
    targetY = ring.y;
    targetZ = ring.z;
    // Past the ring: come back along the route line, aiming at a point just
    // before the ring so the re-entry flies through the hoop, not at it.
    // On the line: follow the line.
    targetHeading = along > segLen + 30
      ? headingTo(plane, ring.x - (segX / segLen) * 60, ring.z - (segZ / segLen) * 60)
      : segH + clamp(-cross * 0.012, -0.6, 0.6);
  } else {
    // No rings left: line up on the runway and come down.
    // Pattern: steer to a gate 350 units before the threshold at circuit height,
    // then ride the glide path down the centreline; aim at the ground once close.
    landing = true;
    // The runway that ends this sortie is the next pad along the route.
    const r = RUNWAYS[run.mission + 1];
    const rGround = heightAt(r.x, r.z);
    const fx = Math.sin(r.heading);
    const fz = Math.cos(r.heading);
    const dx = plane.x - r.x;
    const dz = plane.z - r.z;
    const along = dx * fx + dz * fz; // + = past the threshold
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    const dist = Math.hypot(dx, dz);
    if (dist < 130) {
      targetX = r.x;
      targetZ = r.z;
      targetY = rGround + 1.5;
      // Steer back to the centreline when the crosswind has pushed us off it.
      targetHeading = Math.abs(across) > 8 ? headingTo(plane, r.x, r.z) : r.heading;
    } else if (along < 100 && Math.abs(across) < 120 && Math.abs(headingError(plane, r.heading)) < 0.5) {
      targetX = r.x;
      targetZ = r.z;
      targetY = rGround + Math.max(8, dist * 0.12);
      targetHeading = Math.abs(across) > 12 ? headingTo(plane, r.x, r.z) : r.heading;
    } else {
      // Pattern: steer to a gate 350 units before the threshold. Climb to
      // circuit height first so the turn clears the canyon walls.
      targetX = r.x - fx * 350;
      targetZ = r.z - fz * 350;
      targetY = rGround + 120;
      targetHeading = headingTo(plane, targetX, targetZ);
    }
  }
  const err = headingError(plane, targetHeading);
  const bank = clamp(err * 1.8, -1, 1);
  const altErr = targetY - plane.y;
  let pitch = clamp(altErr * 0.025, -1, 1);
  if (landing) pitch = clamp(pitch, -0.65, 1.0); // never dive at the runway (input -0.65 is about -0.27 rad of pitch)
  if (landing) {
    // Close over the runway: hold a fixed descent until the wheels touch.
    const r = RUNWAYS[run.mission + 1];
    const distClose = Math.hypot(plane.x - r.x, plane.z - r.z);
    if (distClose < 130) pitch = -0.55;
  }
  let throttle = 0;
  if (landing) {
    const dist = Math.hypot(plane.x - RUNWAYS[run.mission + 1].x, plane.z - RUNWAYS[run.mission + 1].z);
    if (dist > 350) throttle = plane.speed < 75 ? 0.6 : -0.5;
    else throttle = plane.speed > 58 ? -1 : 0.3;
  } else if (plane.speed < 72) {
    throttle = 1;
  } else if (plane.speed > 80) {
    throttle = -1;
  }
  return { pitch, bank, throttle, boost: false };
}

/** Run the world forward for `seconds` of autopilot flight. */
function flyFor(plane, run, seconds) {
  for (let i = 0; i < seconds / STEP; i++) {
    const events = stepFlight(plane, run, autopilotInput(plane, run), STEP);
    run.elapsed += STEP;
    if (events.includes('crash') || events.includes('fuel') || events.includes('timeout') || events.includes('win')) {
      return events;
    }
    if (events.includes('land')) return events;
  }
  return [];
}

/**
 * Set the world to the named scene and return the screen to draw over it.
 * start: on the home runway at dawn, title screen.
 * play: mid-flight in sortie 1, a ring ahead, HUD lit.
 * canyon: mid-flight in sortie 2, canyon walls around the route.
 * end: just landed after sortie 1, mission-complete screen.
 */
export function stageShot(name, plane, run) {
  if (name === 'canyon') {
    // Sortie 2 starts from the Cinder Strip: take off there and fly its gorge rings.
    placeOnRunway(plane, 1);
    run.mission = 1;
    run.phase = 'fly';
    run.timeLeft = MISSIONS[1].timeLimit;
    flyFor(plane, run, CANYON_SECONDS);
    return { screen: 'fly' };
  }
  if (name === 'end') {
    run.phase = 'fly';
    const events = flyFor(plane, run, END_LIMIT_SECONDS);
    if (events.includes('land')) return { screen: 'landed' };
    return { screen: 'fly' };
  }
  if (name === 'play') {
    run.phase = 'fly';
    flyFor(plane, run, PLAY_SECONDS);
    return { screen: 'fly' };
  }
  // start
  run.phase = 'title';
  flyFor(plane, run, START_SECONDS);
  run.phase = 'title';
  return { screen: 'title' };
}
