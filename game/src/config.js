// Ember Isles Airlift — tuning, missions and scoring.
// One flight, three sorties: 18 rings, 6 bonus rings, 12 supply crates,
// 4 aircraft upgrades, 3 medals, 3 runway landings, 3 skies.

export const WORLD_SEED = 20261126;

/** The game's title, written like a one-line design doc. */
export const GAME_TITLE = 'Ember Isles Airlift — 18 rings, 6 bonus rings, 3 sorties, 12 crates, 4 upgrades, 3 medals, 3 skies';

/** One-line summary for the README and the repo About box. */
export const GAME_SUMMARY = 'Ember Isles Airlift — a bush-plane airlift across a volcanic archipelago at golden hour: 18 rings, 6 bonus rings, 3 sorties, 12 crates, 4 aircraft upgrades, 3 medals, 3 skies.';

/** Longer description for the README. */
export const GAME_DESCRIPTION = 'A bush-plane airlift across the Ember Isles, a volcanic archipelago at golden hour: thread 18 rings through three sorties, land on three island strips, spend spare parts on four aircraft upgrades, and chase the six violet bonus rings off the route.';

/** Canvas size the game is designed for (the screenshots are 1280x480). */
export const VIEW = { width: 1280, height: 480 };

/** Flight model tuning. Speeds are world units per second. */
export const FLIGHT = {
  minSpeed: 34,
  cruiseSpeed: 72,
  maxSpeed: 128,
  boostSpeed: 152,
  accel: 26,
  decel: 34,
  maxBank: 1.05, // radians of roll at full stick
  bankRate: 4.0, // how fast the bank angle answers
  turnRate: 0.85, // heading change per second at full bank
  maxPitch: 0.42,
  pitchRate: 1.9,
  climbFactor: 0.9,
  fuelDrain: 0.42, // per second at cruise throttle
  fuelDrainBoost: 0.85,
  fuelRingBonus: 25,
  hullMax: 100,
  balloonDamage: 34,
  stallSpeed: 30,
};

/** Ring, crate and hazard sizes. */
export const COURSE = {
  ringRadius: 15,
  ringPassRadius: 13.5,
  crateRadius: 11,
  balloonRadius: 10,
  ringSpacing: 225,
  runwayLength: 340,
  runwayWidth: 46,
  runwayHeading: 0,
};

/** The three sorties. Rings and crates are counted across the whole flight. */
export const MISSIONS = [
  {
    name: 'Sortie 1 — Dawn Delivery',
    brief: 'Fly the Ember Coast, thread 4 rings, land on Runway 09.',
    rings: 4,
    crates: 4,
    timeLimit: 100,
    wind: 0,
    storm: false,
    medal: { gold: 800, silver: 550, bronze: 350 },
  },
  {
    name: 'Sortie 2 — Gorge Run',
    brief: 'Thread 6 rings through the lava gorge at golden hour. Watch the crosswind.',
    rings: 6,
    crates: 4,
    timeLimit: 130,
    wind: 9,
    storm: false,
    medal: { gold: 950, silver: 650, bronze: 400 },
  },
  {
    name: 'Sortie 3 — Dusk Storm Circuit',
    brief: '8 rings in the ash storm. Clouds hide the course — trust the needle.',
    rings: 8,
    crates: 4,
    timeLimit: 160,
    wind: 6,
    storm: true,
    medal: { gold: 1100, silver: 750, bronze: 450 },
  },
];

/** Aircraft upgrades, bought with spare parts on the landed screen. */
export const UPGRADES = [
  { id: 'engine', name: 'Engine', desc: '+14 top speed', cost: 2, max: 2 },
  { id: 'tanks', name: 'Tanks', desc: '+30 fuel capacity', cost: 2, max: 2 },
  { id: 'armour', name: 'Armour', desc: '+40 hull', cost: 2, max: 2 },
  { id: 'agility', name: 'Agility', desc: '+25% turn rate', cost: 2, max: 2 },
];

/** Points. */
export const SCORE = {
  ring: 100,
  bonusRing: 150,
  crate: 50,
  landing: 250,
  timeBonusPerSecond: 4,
  noDamageBonus: 150,
  medalBonus: { gold: 200, silver: 100, bronze: 50 },
};

/** Sky palettes, one per sortie: dawn, golden hour, dusk storm. */
export const SKIES = [
  { skyTop: '#1c2f5e', skyMid: '#4a6fa5', skyHorizon: '#f2a65e', sun: '#ffd9a0', sunY: 300 },
  { skyTop: '#2b3a6e', skyMid: '#8a5a4a', skyHorizon: '#ffb347', sun: '#ffe6b0', sunY: 260 },
  { skyTop: '#171226', skyMid: '#4a2f4d', skyHorizon: '#c65a3c', sun: '#ff9a66', sunY: 340 },
];

/** Dawn palette, one style for sky, terrain and instruments. */
export const PALETTE = {
  skyTop: '#1c2f5e',
  skyMid: '#4a6fa5',
  skyHorizon: '#f2a65e',
  sun: '#ffd9a0',
  water: '#2e6f9e',
  grassLow: '#4d7a3a',
  grassHigh: '#7a9a4a',
  fieldAlt: '#6b8f3e',
  rock: '#6e6258',
  snow: '#e8ecf2',
  runway: '#2b2f36',
  runwayLine: '#f5f2e8',
  ring: '#ffb02e',
  ringGlow: '#ffdf8a',
  fuelRing: '#39d353',
  crate: '#f2c230',
  balloon: '#d64545',
  hudPanel: 'rgba(8, 16, 28, 0.72)',
  hudInk: '#cfe8ff',
  hudAmber: '#ffb02e',
  hudGreen: '#39d353',
  hudRed: '#ff5a4e',
};
