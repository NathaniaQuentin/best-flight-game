// Flight model for Ember Isles Airlift: pitch, bank, throttle, heading, fuel, hull,
// ring passes, crate pickups, balloon hits and runway landings.
// Pure simulation (no DOM), so it can be driven by the game loop, the autopilot
// or a Node test harness alike.

import { FLIGHT, COURSE, SCORE, MISSIONS } from './config.js';
import { clamp } from './random.js';
import { pathHeading, RUNWAYS } from './geometry.js';
import { heightAt } from './terrain.js';
import { nextRing, award, completeMission } from './course.js';

/** Place the plane at the start of runway `index`, lined up for takeoff. */
export function placeOnRunway(plane, index) {
  const r = RUNWAYS[index];
  plane.x = r.x;
  plane.y = heightAt(r.x, r.z) + 2;
  plane.z = r.z - r.length / 2 + 30;
  plane.heading = r.heading;
  plane.pitch = 0;
  plane.bank = 0;
  plane.speed = 0;
  plane.throttle = 0.55;
  plane.airborne = false;
  plane.verticalSpeed = 0;
}

/** Fresh plane at the home runway, lined up for takeoff. */
export function newPlane() {
  const plane = {
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0,
    speed: 0, throttle: 0.55, fuel: 100, fuelMax: 100,
    hull: FLIGHT.hullMax, hullMax: FLIGHT.hullMax,
    airborne: false, verticalSpeed: 0,
  };
  placeOnRunway(plane, 0);
  return plane;
}

/** Effective top speed and turn rate, after aircraft upgrades. */
export function effectiveStats(run) {
  const up = run.upgrades || { engine: 0, tanks: 0, armour: 0, agility: 0 };
  return {
    maxSpeed: FLIGHT.maxSpeed + 14 * up.engine,
    turnRate: FLIGHT.turnRate * (1 + 0.25 * up.agility),
  };
}

/** Input for one step: pitch -1..1 (up positive), bank -1..1 (right positive), throttle -1..1, boost. */
export function stepFlight(plane, run, input, dt) {
  const mission = MISSIONS[run.mission];
  const events = [];

  // Throttle and speed.
  const stats = effectiveStats(run);
  plane.throttle = clamp(plane.throttle + input.throttle * dt * 0.55, 0, 1);
  const target = FLIGHT.minSpeed + plane.throttle * (stats.maxSpeed - FLIGHT.minSpeed);
  const boostTarget = input.boost ? FLIGHT.boostSpeed : target;
  const rate = boostTarget > plane.speed ? FLIGHT.accel : FLIGHT.decel;
  plane.speed += clamp(boostTarget - plane.speed, -rate * dt, rate * dt);
  if (plane.speed < FLIGHT.stallSpeed && plane.airborne) plane.speed = FLIGHT.stallSpeed;

  // Bank and pitch answer the stick, then ease back toward level.
  const bankTarget = input.bank * FLIGHT.maxBank;
  plane.bank += clamp(bankTarget - plane.bank, -FLIGHT.bankRate * dt, FLIGHT.bankRate * dt);
  const pitchTarget = input.pitch * FLIGHT.maxPitch;
  plane.pitch += clamp(pitchTarget - plane.pitch, -FLIGHT.pitchRate * dt, FLIGHT.pitchRate * dt);

  // Heading follows the bank; climb follows the pitch.
  const wind = mission.wind * Math.sin(run.elapsed * 0.7 + plane.z * 0.004);
  plane.heading += plane.bank * stats.turnRate * (plane.speed / FLIGHT.cruiseSpeed) * dt;
  plane.heading += (wind * 0.02 * (plane.speed / FLIGHT.cruiseSpeed)) * dt;
  const climb = Math.sin(plane.pitch) * plane.speed * FLIGHT.climbFactor;
  plane.verticalSpeed = climb;
  plane.y += climb * dt;

  // Move forward along the heading.
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  plane.x += fx * plane.speed * dt;
  plane.z += fz * plane.speed * dt;
  // Crosswind pushes the plane sideways.
  plane.x += Math.cos(plane.heading) * wind * dt * 0.35;

  // Takeoff: fast enough on the runway and pitched up.
  if (!plane.airborne && plane.speed > 46 && plane.pitch > 0.08) {
    plane.airborne = true;
    events.push('takeoff');
  }

  // Fuel drains with throttle; empty tanks end the flight.
  const drain = (input.boost ? FLIGHT.fuelDrainBoost : FLIGHT.fuelDrain) * (0.4 + plane.throttle) * dt;
  plane.fuel = Math.max(0, plane.fuel - drain);
  if (plane.fuel <= 0) {
    events.push('fuel');
    return events;
  }

  // Storm turbulence shakes the plane inside the clouds.
  if (mission.storm) {
    for (const c of run.course.clouds) {
      const dx = plane.x - c.x;
      const dy = plane.y - c.y;
      const dz = plane.z - c.z;
      if (dx * dx + dy * dy + dz * dz < c.r * c.r) {
        plane.bank += Math.sin(run.elapsed * 9 + c.z) * 0.35 * dt;
        plane.pitch += Math.cos(run.elapsed * 7.3) * 0.2 * dt;
        break;
      }
    }
  }

  // Rings: fly through the hoop.
  const ring = nextRing(run);
  if (ring) {
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < COURSE.ringPassRadius) {
      ring.passed = true;
      run.ringsPassed += 1;
      award(run, SCORE.ring, `RING ${run.ringsPassed}/18  +${SCORE.ring}`);
      if (ring.fuel) {
        plane.fuel = Math.min(plane.fuelMax, plane.fuel + FLIGHT.fuelRingBonus);
        run.message = `RING +${SCORE.ring}  ·  FUEL +${FLIGHT.fuelRingBonus}`;
      }
      events.push('ring');
    }
  }

  // Bonus rings: violet hoops off the route, worth extra points.
  for (const b of run.course.bonusRings) {
    if (b.passed) continue;
    const dx = plane.x - b.x;
    const dy = plane.y - b.y;
    const dz = plane.z - b.z;
    if (dx * dx + dy * dy + dz * dz < COURSE.ringPassRadius * COURSE.ringPassRadius) {
      b.passed = true;
      award(run, SCORE.bonusRing, `BONUS RING  +${SCORE.bonusRing}`);
      events.push('bonus');
    }
  }

  // Crates: fly close to collect.
  for (const crate of run.course.crates) {
    if (crate.taken) continue;
    const dx = plane.x - crate.x;
    const dy = plane.y - crate.y;
    const dz = plane.z - crate.z;
    if (dx * dx + dy * dy + dz * dz < COURSE.crateRadius * COURSE.crateRadius) {
      crate.taken = true;
      run.cratesTaken += 1;
      run.parts += 1;
      award(run, SCORE.crate, `SUPPLY CRATE  +${SCORE.crate}  ·  +1 PART`);
      events.push('crate');
    }
  }

  // Balloons: a hit costs hull and knocks the plane.
  for (const b of run.course.balloons) {
    if (b.hit) continue;
    const dx = plane.x - b.x;
    const dy = plane.y - b.y;
    const dz = plane.z - b.z;
    if (dx * dx + dy * dy + dz * dz < COURSE.balloonRadius * COURSE.balloonRadius) {
      b.hit = true;
      plane.hull -= FLIGHT.balloonDamage;
      run.missionDamage = true;
      plane.bank += 0.5;
      award(run, 0, `BALLOON STRIKE  ·  HULL ${Math.max(0, plane.hull)}%`);
      events.push('balloon');
      if (plane.hull <= 0) {
        events.push('crash');
        return events;
      }
    }
  }

  // Ground: touching terrain anywhere but a runway is a crash.
  const ground = heightAt(plane.x, plane.z);
  const runway = runwayUnder(plane);
  if (plane.y <= ground + 1.5) {
    if (runway && plane.airborne && plane.speed < 95 && plane.verticalSpeed > -20) {
      return land(plane, run, runway, events);
    }
    if (plane.y <= ground + 0.4) {
      events.push('crash');
      return events;
    }
  }

  // The clock: a sortie that runs out of time is failed.
  run.timeLeft -= dt;
  if (run.timeLeft <= 0) {
    events.push('timeout');
    return events;
  }
  return events;
}

/** The runway under the plane, if it is over one and roughly aligned with it. */
export function runwayUnder(plane) {
  for (const r of RUNWAYS) {
    const dx = plane.x - r.x;
    const dz = plane.z - r.z;
    const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    if (Math.abs(along) < r.length / 2 && Math.abs(across) < r.width / 2) return r;
  }
  return null;
}

/** Touch down: finish the sortie, or win the whole flight on the last runway. */
function land(plane, run, runway, events) {
  plane.y = heightAt(plane.x, plane.z) + 1.2;
  plane.speed *= 0.4;
  plane.airborne = false;
  plane.pitch = 0;
  plane.bank = 0;
  const medal = completeMission(run);
  events.push('land');
  if (run.mission >= 2) {
    run.phase = 'win';
    events.push('win');
    return events;
  }
  // Next sortie starts from this runway: refuel, reset the clock, relaunch.
  run.mission += 1;
  run.missionScore = 0;
  run.missionDamage = false;
  run.timeLeft = MISSIONS[run.mission].timeLimit;
  plane.fuel = plane.fuelMax;
  plane.hull = plane.hullMax;
  plane.heading = runway.heading;
  plane.throttle = 0.55;
  run.phase = 'landed';
  events.push('next');
  return events;
}

/** Heading from the plane toward a point, for the autopilot and the HUD needle. */
export function headingTo(plane, x, z) {
  return Math.atan2(x - plane.x, z - plane.z);
}

/** Normalised turn error toward a heading, -PI..PI. */
export function headingError(plane, target) {
  let e = target - plane.heading;
  while (e > Math.PI) e -= Math.PI * 2;
  while (e < -Math.PI) e += Math.PI * 2;
  return e;
}

/** Runway heading at the plane's position, for the landing approach. */
export function runwayHeadingAt(z) {
  return pathHeading(z);
}
