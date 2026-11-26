// Ember Isles Airlift — main loop: screens, input, simulation, sound and rendering.
// Opens with ?shot=start|play|canyon|end to stage a screenshot scene instead.

import { VIEW, MISSIONS, UPGRADES } from './config.js';
import { buildCourse, newRun } from './course.js';
import { newPlane, stepFlight, placeOnRunway } from './flight.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { stageShot } from './shots.js';
import { SoundEngine } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed') || '1');

const sound = new SoundEngine();
const input = createInput();

let plane = newPlane();
let run = newRun(buildCourse());
let lastTime = 0;
let shotStaged = false;

/** Start a fresh flight from the home strip. */
function resetFlight() {
  plane = newPlane();
  run = newRun(buildCourse());
  run.phase = 'title';
}

/** Handle one simulation step's events: sounds and phase changes. */
function handleEvents(events) {
  for (const e of events) {
    if (e === 'ring') sound.ring();
    if (e === 'bonus') sound.ring();
    if (e === 'crate') sound.crate();
    if (e === 'balloon') sound.balloon();
    if (e === 'land') sound.land();
    if (e === 'win') sound.win();
    if (e === 'crash') {
      sound.crash();
      run.phase = 'over';
      run.reason = 'The plane went down — terrain, balloon or empty tanks.';
    }
    if (e === 'fuel') {
      sound.crash();
      run.phase = 'over';
      run.reason = 'Out of fuel — the engine quit over open ground.';
    }
    if (e === 'timeout') {
      run.phase = 'over';
      run.reason = 'Out of time — the sortie window closed.';
    }
  }
  if (run.phase === 'landed') {
    // The plane waits on the runway until the pilot takes off again.
    placeOnRunway(plane, run.mission);
    plane.fuel = plane.fuelMax;
    plane.hull = plane.hullMax;
  }
}

/** One frame: read input, step the world, draw. */
function frame(timeMs) {
  const dt = Math.min(0.05, lastTime === 0 ? 0.016 : (timeMs - lastTime) / 1000);
  lastTime = timeMs;
  const { pressed } = input.poll();

  if (pressed.has('Enter')) {
    if (run.phase === 'title') {
      sound.start();
      run.phase = 'fly';
    } else if (run.phase === 'landed') {
      run.phase = 'fly';
    } else if (run.phase === 'win' || run.phase === 'over') {
      resetFlight();
      sound.start();
      run.phase = 'fly';
    }
  }
  // Upgrade shop on the landed screen: keys 1-4 buy one level, 2 parts each.
  if (run.phase === 'landed') {
    for (let i = 0; i < UPGRADES.length; i++) {
      if (pressed.has(String(i + 1))) {
        const up = UPGRADES[i];
        const level = run.upgrades[up.id];
        if (level < up.max && run.parts >= up.cost) {
          run.parts -= up.cost;
          run.upgrades[up.id] = level + 1;
          if (up.id === 'tanks') {
            plane.fuelMax = 100 + 30 * run.upgrades.tanks;
            plane.fuel = plane.fuelMax;
          }
          if (up.id === 'armour') {
            plane.hullMax = 100 + 40 * run.upgrades.armour;
            plane.hull = plane.hullMax;
          }
          run.message = `${up.name.toUpperCase()} MK${level + 1} INSTALLED`;
          run.messageAt = run.elapsed;
          sound.ring();
        }
      }
    }
  }
  if (pressed.has('p') || pressed.has('P')) {
    if (run.phase === 'fly') run.phase = 'paused';
    else if (run.phase === 'paused') run.phase = 'fly';
  }
  if (pressed.has('m') || pressed.has('M')) sound.toggleMute();
  if (pressed.has('r') || pressed.has('R')) {
    resetFlight();
    run.phase = 'fly';
  }

  if (run.phase === 'fly') {
    run.elapsed += dt;
    const events = stepFlight(plane, run, input.state, dt);
    handleEvents(events);
    sound.update(plane);
  }

  render(ctx, plane, run, timeMs);
  requestAnimationFrame(frame);
}

/** Screenshot mode: stage the scene once, draw one frame, then keep drawing it. */
function stageAndShow() {
  const staged = stageShot(shotName, plane, run);
  run.phase = staged.screen === 'title' ? 'title' : staged.screen === 'landed' ? 'landed' : 'fly';
  run.elapsed = 0;
  render(ctx, plane, run, 1200);
  document.title = `Ember Isles Airlift — shot ${shotName} (seed ${seedParam})`;
  shotStaged = true;
}

if (shotName) {
  stageAndShow();
  // Keep repainting so the canvas is never blank in a screenshot.
  requestAnimationFrame(function repaint(timeMs) {
    render(ctx, plane, run, 1200);
    requestAnimationFrame(repaint);
  });
} else {
  requestAnimationFrame(frame);
}
