import type { IncomingKind, WaveMode } from './types'

// Central tuning values for the whole game. The playfield is the z = 0 plane:
// x is horizontal, y is vertical (up), the camera looks along -z. This gives the
// classic 2D Missile Command layout a fully 3D presentation.

export const FIELD = {
  minX: -26,
  maxX: 26,
  groundY: 0,
  skyY: 26,
  depth: 4, // half-depth of the ground slab in z, purely cosmetic
}

// Battery emplacements (fire counter-missiles).
export const BATTERIES = [
  { id: 'bat-l', x: -22 },
  { id: 'bat-c', x: 0 },
  { id: 'bat-r', x: 22 },
] as const

// Cities to defend.
export const CITIES = [
  { id: 'city-0', x: -16 },
  { id: 'city-1', x: -11 },
  { id: 'city-2', x: -6 },
  { id: 'city-3', x: 6 },
  { id: 'city-4', x: 11 },
  { id: 'city-5', x: 16 },
] as const

export const AMMO_PER_BATTERY = 10

export const PLAYER_MISSILE_SPEED = 42 // units / second
export const EXPLOSION_MAX_RADIUS = 2.9
export const EXPLOSION_GROW_TIME = 0.35 // s to reach max radius
export const EXPLOSION_HOLD_TIME = 0.35 // s at max radius
export const EXPLOSION_SHRINK_TIME = 0.5 // s to collapse

// Ground shockwave ring cast when a warhead strikes the surface.
export const SHOCKWAVE_DURATION = 1.1
export const SHOCKWAVE_MAX_RADIUS = 6.5

export const INCOMING_BASE_SPEED = 3.2 // units / second at wave 1
export const INCOMING_SPEED_PER_WAVE = 0.55

// MIRV splitters: an incoming warhead that fans out into several children mid-descent.
export const MIRV_FIRST_WAVE = 2
export const MIRV_CHILDREN_MIN = 2
export const MIRV_CHILDREN_MAX = 3
export function mirvChanceForWave(wave: number): number {
  if (wave < MIRV_FIRST_WAVE) return 0
  return Math.min(0.4, 0.1 + (wave - MIRV_FIRST_WAVE) * 0.06)
}

// Smart bombs: steer away from nearby explosions, so they must be hit directly.
export const SMART_FIRST_WAVE = 3
export const SMART_DODGE_RANGE = 4.2 // starts evading when a blast is this close
export const SMART_DODGE_SPEED = 9 // lateral units / second while dodging
export function smartChanceForWave(wave: number): number {
  if (wave < SMART_FIRST_WAVE) return 0
  return Math.min(0.22, 0.06 + (wave - SMART_FIRST_WAVE) * 0.04)
}

// --- SLBM ATTACK -----------------------------------------------------------------
// Every third wave from the third, the war moves offshore: submarines surface out at
// sea and lob ballistic missiles at the coast on high arcs. The camera swings round to
// an oblique view of the same z = 0 plane, so the cities compress onto the right of the
// screen and the ocean recedes away to the left.

export const SLBM_FIRST_WAVE = 3
export const SLBM_WAVE_INTERVAL = 3

// --- BOMBERS INCOMING ---------------------------------------------------------------
// Every fifth wave from the fifth, you climb into the pit at one of the batteries and
// man the gun yourself. Formations come over at altitude on varied bearings, release,
// and it is on you to catch them first — while facing only one way at a time.

export const BOMBER_FIRST_WAVE = 5
export const BOMBER_WAVE_INTERVAL = 5

/**
 * The wave's flavour. Decided once in `beginWave` and read by camera, loop and UI.
 *
 * The two special modes land on their own cycles, which collide every fifteen waves;
 * the gun takes precedence there because it comes round least often. `modeForWave`'s
 * first twenty waves are pinned by a test, since a rotation is the sort of thing that
 * looks right in the rule and wrong in the sequence.
 */
export function modeForWave(wave: number): WaveMode {
  if (wave >= BOMBER_FIRST_WAVE && wave % BOMBER_WAVE_INTERVAL === 0) return 'bombers'
  return wave >= SLBM_FIRST_WAVE && wave % SLBM_WAVE_INTERVAL === 0 ? 'slbm' : 'classic'
}

// The gun. Shells fly straight and fast, and burst near whatever they pass, so a near
// miss counts — the skill being asked for is leading a crossing target, not threading a
// needle at six hundred metres.
export const SHELL_SPEED = 100 // units/second
export const SHELL_BURST_RADIUS = 1.9
export const SHELL_LIFETIME = 2.4 // seconds before it is spent
export const SHELL_INTERVAL = 0.16 // ~6 rounds a second

/**
 * Heat, not ammunition. A ten-round magazine makes no sense for a gun, and counting
 * rounds is a worse game than managing bursts: fire too long and the gun locks out until
 * it has cooled well below the limit.
 */
export const GUN_HEAT_PER_SHOT = 0.075
export const GUN_COOL_PER_SECOND = 0.34
export const GUN_LOCKOUT_BELOW = 0.35 // must fall back to this before it will fire again

export const BOMBER_SPEED = 12 // units/second along its run
export const BOMBER_SPEED_PER_WAVE = 0.6
export const BOMBER_ALTITUDE = [20, 30] as const
export const BOMBER_HITS = 4 // shell bursts to bring one down
export const BOMBER_HALF_SPAN = 3.4 // for hit tests, and roughly how big it looks
export const BOMB_HITS = 1
export const BOMB_GRAVITY = 16 // units/second², tuned for a readable fall
export const BOMBS_PER_BOMBER = 2

/** How far out a formation appears, and how far past the coast it flies before turning for home. */
export const BOMBER_RUN_RADIUS = 120

export const SCORE_PER_BOMBER = 150
export const SCORE_PER_BOMB = 30

export function bomberSpeedForWave(wave: number): number {
  return BOMBER_SPEED + Math.max(0, wave - BOMBER_FIRST_WAVE) * BOMBER_SPEED_PER_WAVE
}

/** Flights of three, so the count steps in threes and the sky fills in formations. */
export function bomberFlightsForWave(wave: number): number {
  return 3 + Math.floor((wave - BOMBER_FIRST_WAVE) / BOMBER_WAVE_INTERVAL)
}

/**
 * Whether the player may move between emplacements. Held back on the mode's first
 * outing: learning to lead a crossing target is enough to be going on with, without
 * also being asked where to stand.
 */
export function canChangePosition(wave: number): boolean {
  return wave > BOMBER_FIRST_WAVE
}

/**
 * Whether to warn that the next wave is an SLBM attack. Held back until the wave has
 * launched everything it is going to — the warning is for the lull while you shoot down
 * the stragglers, so it lands as a red horizon rather than as noise over a fight.
 */
export function slbmWarningDue(wave: number, spawnedThisWave: number, toSpawn: number): boolean {
  if (modeForWave(wave) === 'slbm' || modeForWave(wave + 1) !== 'slbm') return false
  return toSpawn > 0 && spawnedThisWave >= toSpawn
}

// The ocean: a band of open water off the left edge of the coast. Submarines hold
// station anywhere in it, spread through z as well as x so the water reads as a
// surface rather than a line.
export const SEA = {
  minX: -104,
  maxX: -50, // nearest a submarine dares come to the coast
  halfDepth: 12, // z spread
}

/** How far the camera swings round for the offshore view, in radians. */
export const SLBM_CAMERA_YAW = 0.52

export const SUBS_BASE = 2 // submarines at the first SLBM wave
export const SUBS_PER_WAVE = 1 / 3 // ...and roughly one more every three waves after
export const SUBS_MAX = 5

// A submarine's cycle: it runs deep and untouchable, surfaces to shoot, then dives and
// relocates. The exposed window is the whole game of the mode — it is the only time the
// boat can be killed, and killing it takes the rest of its salvo out of the wave.
export const SUB_SUBMERGED_TIME = [5, 8.5] as const // random hold before surfacing
export const SUB_SURFACING_TIME = 1.1
export const SUB_DIVING_TIME = 1.1
export const SUB_SALVO = [2, 3] as const // missiles per surfacing
export const SUB_SALVO_INTERVAL = 1.6
/**
 * A beat on the surface after the last launch, before the boat dives.
 *
 * Without it the salvo's final missile and the start of the dive were the same instant,
 * so the moment the wave *tells* you a boat is up — the bar's prompt, the hull on the
 * water — was already the moment it was leaving. A strike thrown at that had to have been
 * in the air before the cue appeared.
 */
export const SUB_SURFACED_HOLD = 0.9
export const SUB_HULL_LENGTH = 7.5
export const SUB_KILL_SCORE = 300

// Ballistic arcs. Apex is a fraction of ground track, floored so even a short lob
// climbs into the sky, and the whole flight is slower than a classic dive — you can
// see it coming, the difficulty is judging where it will be, not whether you noticed.
export const SLBM_SPEED = 9 // units/second along the ground track at wave 1
export const SLBM_SPEED_PER_WAVE = 0.35
export const SLBM_APEX_RATIO = 0.42
export const SLBM_APEX_MIN = 22
export const SLBM_APEX_MAX = 52
export const SCORE_PER_SLBM = 45

export function slbmSpeedForWave(wave: number): number {
  return SLBM_SPEED + Math.max(0, wave - SLBM_FIRST_WAVE) * SLBM_SPEED_PER_WAVE
}

export function subCountForWave(wave: number): number {
  return Math.min(SUBS_MAX, Math.round(SUBS_BASE + (wave - SLBM_FIRST_WAVE) * SUBS_PER_WAVE))
}

// Weapons available in the mode. The interceptor is the familiar counter-missile, but
// it lobs too, so it has to be aimed where the warhead is going.
export const INTERCEPTOR_ARC_RATIO = 0.3 // apex as a fraction of range
/**
 * Faster than the classic straight shot, not slower — which is the opposite of where this
 * started, and the reason the mode played as unfairly hard as it did.
 *
 * The offshore theatre is about three times the size of the classic playfield, so the same
 * shot covers three times the ground; giving it a *lower* speed on top of that put the
 * counter-missile in the air long enough for a warhead to move nearly four blast radii
 * while it flew. Aiming straight at a target was a guaranteed miss and the lead that would
 * have connected had a tolerance of about a quarter of itself. `slbmPacing.test.ts`
 * measures that lead against the blast, which is what the number is really set by.
 */
export const INTERCEPTOR_ARC_SPEED = 66

// Flak: a cheap cloud that hangs in the air and kills whatever flies into it. Wide and
// patient rather than precise — and useless against smart bombs, which steer around any
// live burst just as they do a blast.
export const FLAK_ROUNDS = 6 // per SLBM wave
export const FLAK_RADIUS = 4.6
export const FLAK_GROW_TIME = 0.25
export const FLAK_HOLD_TIME = 3.4
export const FLAK_FADE_TIME = 0.7
export const FLAK_SPEED = 46

// Sub strike: a slow torpedo-carrying rocket lobbed out to a point on the water. It
// only ever kills what is on the surface, so it is worth nothing unless a boat has
// committed to a launch.
export const SUB_STRIKE_ROUNDS = 3 // per SLBM wave
/**
 * Fast enough to reach the far corner of the sea inside a boat's exposed window with time
 * to spare for a player to have noticed and aimed. At 32 the longest run took 2.6 seconds
 * against a window as short as 3.3, which left less slack than a human reaction — the far
 * boats could not be hit at all, however well you read them. `slbmPacing.test.ts` measures
 * that slack rather than trusting this number.
 */
export const SUB_STRIKE_SPEED = 56
export const SUB_STRIKE_RADIUS = 7.5

// A reserve city is earned each time the score crosses a multiple of this, and is
// spent at the start of a wave to rebuild a destroyed city (classic Missile Command).
export const BONUS_CITY_SCORE = 3000

// Scoring
export const SCORE_PER_MISSILE = 25
export const SCORE_BY_KIND: Record<IncomingKind, number> = {
  normal: 25,
  mirv: 40,
  smart: 75,
  slbm: SCORE_PER_SLBM,
}
export const SCORE_PER_CITY_BONUS = 100
export const SCORE_PER_AMMO_BONUS = 5

export function incomingSpeedForWave(wave: number): number {
  return INCOMING_BASE_SPEED + (wave - 1) * INCOMING_SPEED_PER_WAVE
}

export function missileCountForWave(wave: number): number {
  return 8 + wave * 2
}

export function slbmCountForWave(wave: number): number {
  // Grows faster than the classic count, because the warheads have been slowed down and
  // the wave would otherwise be over before a player had worked out what they are
  // looking at. See slbmPacing.test.ts, which measures what these numbers add up to.
  return Math.floor(9 + wave * 1.5)
}

// Palette
export const COLORS = {
  bomber: '#2a3346',
  bomberGlow: '#ffb45c',
  tracer: '#ffe9a8',
  coast: '#7fe9ff',
  coastGlow: '#2f7fd0',
  land: '#0b1024',
  sea: '#123566',
  contour: '#4a9fd6',
  sub: '#8fe0d0',
  subHull: '#16323c',
  subPing: '#2f7d74',
  flak: '#ffd166',
  strike: '#b6ff6e',
  player: '#38f0ff',
  playerTrail: '#0aa9c4',
  enemy: '#ff5a5a',
  enemyTrail: '#7a1f1f',
  mirv: '#ff9d3c',
  mirvTrail: '#7a4a12',
  smart: '#e05dff',
  smartTrail: '#5a1f7a',
  explosion: '#ffe14d',
  city: '#7aa8ff',
  cityDead: '#3a3a44',
  battery: '#9be08f',
  ground: '#1b2233',
  sky: '#05060f',
}
