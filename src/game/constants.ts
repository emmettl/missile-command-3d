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

export const INCOMING_BASE_SPEED = 3.2 // units / second at wave 1
export const INCOMING_SPEED_PER_WAVE = 0.55

// Scoring
export const SCORE_PER_MISSILE = 25
export const SCORE_PER_CITY_BONUS = 100
export const SCORE_PER_AMMO_BONUS = 5

export function incomingSpeedForWave(wave: number): number {
  return INCOMING_BASE_SPEED + (wave - 1) * INCOMING_SPEED_PER_WAVE
}

export function missileCountForWave(wave: number): number {
  return 8 + wave * 2
}

// Palette
export const COLORS = {
  player: '#38f0ff',
  playerTrail: '#0aa9c4',
  enemy: '#ff5a5a',
  enemyTrail: '#7a1f1f',
  explosion: '#ffe14d',
  city: '#7aa8ff',
  cityDead: '#3a3a44',
  battery: '#9be08f',
  ground: '#1b2233',
  sky: '#05060f',
}
