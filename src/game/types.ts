import { Vector3 } from 'three'

export type GameStatus = 'menu' | 'launching' | 'playing' | 'wave-clear' | 'gameover'

export interface CityState {
  id: string
  x: number
  alive: boolean
}

export interface BatteryState {
  id: string
  x: number
  ammo: number
  destroyed: boolean
}

// Fast-moving simulation entities. Their `pos` vectors are mutated in place by the
// game loop every frame; React only re-renders the entity lists when entities are
// added or removed (the array reference changes).

export type IncomingKind = 'normal' | 'mirv' | 'smart' | 'slbm'

export type WaveMode = 'classic' | 'slbm' | 'bombers'

/** Player weapons. Only the interceptor exists in a classic wave. */
export type WeaponKind = 'interceptor' | 'flak' | 'strike'

/**
 * A ballistic path: the missile is lerped from start to target while a parabola lifts
 * it, so `elapsed / duration` is the whole of its state. Straight-flying missiles carry
 * no arc and are advanced by velocity instead.
 */
export interface Arc {
  apex: number // metres of lift at the top of the parabola
  duration: number // seconds start to impact
  elapsed: number
}

export interface IncomingMissile {
  id: number
  pos: Vector3
  start: Vector3
  target: Vector3
  targetId: string // city or battery id it is aimed at
  speed: number
  alive: boolean
  kind: IncomingKind
  splitsLeft: number // MIRV warheads still to release (0 for non-splitters)
  splitAltitude: number // y at which a MIRV releases its warheads
  dodge: boolean // smart bombs steer away from nearby explosions
  arc?: Arc // SLBMs fly a parabola; everything else flies straight
  subId?: number // the boat that fired it, so a kill can retire its salvo
}

export interface PlayerMissile {
  id: number
  pos: Vector3
  start: Vector3
  target: Vector3
  alive: boolean
  weapon: WeaponKind
  arc?: Arc
}

export type BlastKind = 'blast' | 'flak'

export interface Explosion {
  id: number
  pos: Vector3
  age: number // seconds since detonation
  radius: number // current radius, updated each frame
  dead: boolean
  kind: BlastKind // flak hangs at radius far longer than a counter-missile blast
}

// --- BOMBERS INCOMING ---------------------------------------------------------------

/**
 * A bomber on a run. It flies a straight line at a fixed altitude towards the city it
 * has been assigned, releases when the ballistics say the bombs will land on it, and
 * carries on out the other side.
 */
export interface Bomber {
  id: number
  pos: Vector3
  /** Unit vector in the ground plane; altitude does not change during a run. */
  heading: Vector3
  speed: number
  hp: number
  alive: boolean
  bombsLeft: number
  /** Seconds until the next bomb of a stick, once the first has gone. */
  stickTimer: number
  released: boolean
  targetId: string
  /** Where the target is, so the release point can be judged against it. */
  targetX: number
}

/** A bomb, once released: pure ballistics, and it can miss. */
export interface Bomb {
  id: number
  pos: Vector3
  vel: Vector3
  alive: boolean
  targetId: string
}

/** One round from the gun. Flies straight — leading the target is enough to ask. */
export interface Shell {
  id: number
  pos: Vector3
  vel: Vector3
  age: number
  alive: boolean
}

/** The gun you are stood behind. */
export interface GunState {
  /** 0 cold, 1 at the limit. */
  heat: number
  /** True while it is locked out and cooling. */
  jammed: boolean
  /** Seconds until the next round may leave the barrel. */
  cadence: number
  /** Index into BATTERIES — the emplacement being manned. */
  position: number
  yaw: number
  pitch: number
}

export type SubPhase = 'submerged' | 'surfacing' | 'firing' | 'diving'

/**
 * A missile submarine holding station out at sea. It is only killable while it is up —
 * `phase` is both the animation state and the vulnerability state.
 */
export interface Submarine {
  id: number
  pos: Vector3 // on the sea plane; y rises as it surfaces
  phase: SubPhase
  timer: number // seconds left in this phase
  salvoLeft: number // launches remaining in the current surfacing
  fireTimer: number // seconds until the next launch
  alive: boolean
}

// A flat ring that expands across the ground plane when a warhead strikes.
export interface ShockWave {
  id: number
  pos: Vector3
  age: number
  dead: boolean
}
